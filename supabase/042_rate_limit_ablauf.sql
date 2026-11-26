-- ============================================================================
-- 042_rate_limit_ablauf.sql
-- Sicherheitstest 24.11.2026, Befund M5 (Mail-Flut über die offene Registrierung)
-- ============================================================================
--
-- PROBLEM
--
-- check_rate_limit (023) räumt gelegentlich alte Zähler weg, und zwar alle, deren
-- Fenster vor mehr als einer Stunde begonnen hat. Bisher war das richtig, weil
-- kein Limit ein längeres Fenster hatte. Die neue globale Obergrenze für
-- Anmelde-Mails zählt aber auch pro Tag (lib/auth/config.ts,
-- anfordernGlobalProTag). Ihr Zähler beginnt um Mitternacht UTC und würde ab
-- 01:00 UTC bei jedem hundertsten Aufruf gelöscht. Danach stünde er wieder auf
-- null, und das Tageslimit hielte nicht.
--
-- LÖSUNG
--
-- Jeder Zähler merkt sich, wann sein Fenster endet (expires_at). Aufgeräumt wird
-- nur, was abgelaufen ist. Zeilen von vor dieser Migration haben kein expires_at;
-- für sie gilt die alte Regel (Fensterbeginn plus eine Stunde), denn vorher gab
-- es nur Fenster bis zu einer Stunde.
--
-- Signatur, Rückgabe und Rechte bleiben gleich. `create or replace` behält
-- Eigentümer und EXECUTE-Rechte (901: nur service_role). Die REVOKEs aus 023
-- stehen unten trotzdem noch einmal, damit die Datei für sich allein stimmt.
--
-- REIHENFOLGE
--
-- Passt zum Code vor und nach PR fix/rate-limit-haertung. Läuft der neue Code
-- ohne diese Migration, hält das Stundenlimit, das Tageslimit setzt sich aber
-- im Lauf des Tages zurück. Darum vor oder gleich nach dem Deploy einspielen.
--
-- Idempotent. Von Hand auf advisori01 einspielen wie die übrigen Migrationen.
-- ============================================================================

begin;

alter table public.rate_limit_counters
  add column if not exists expires_at timestamptz;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits int;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (key, window_start, hits, expires_at)
  values (p_key, v_window_start, 1, v_window_start + make_interval(secs => p_window_seconds))
  on conflict (key, window_start)
  do update set hits = public.rate_limit_counters.hits + 1
  returning hits into v_hits;

  -- Gelegentliches Aufräumen, nur abgelaufene Fenster (siehe oben).
  if random() < 0.01 then
    delete from public.rate_limit_counters
    where coalesce(expires_at, window_start + interval '1 hour') < now();
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public;
revoke execute on function public.check_rate_limit(text, int, int) from anon;
revoke execute on function public.check_rate_limit(text, int, int) from authenticated;

commit;

-- Prüfen (erwartet: expires_at vorhanden, Funktion räumt nach expires_at auf):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'rate_limit_counters';
--   select prosrc like '%expires_at%' as neu from pg_proc where proname = 'check_rate_limit';
