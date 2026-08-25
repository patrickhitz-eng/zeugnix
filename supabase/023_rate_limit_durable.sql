-- ============================================================================
-- 023_rate_limit_durable.sql  (H5 — Betriebshärtung: Rate-Limit durable)
-- ============================================================================
-- Ersetzt den reinen In-Memory-Zähler (lib/rate-limit.ts) durch einen
-- geteilten Supabase-Store, damit das Limit über mehrere Lambda-/Server-
-- Instanzen hinweg greift. Bewusst KEIN neuer Anbieter (Redis/Upstash) –
-- bleibt "gratis" wie im Werkstatt-Board gelabelt.
--
-- Bewusste Vereinfachung: FESTES Zeitfenster statt gleitendes
-- (Sliding-Window) – Durability wichtiger als Praezision an der Fensterkante.
-- lib/rate-limit.ts faellt bei Fehlern (Tabelle/RPC nicht erreichbar) auf die
-- bisherige In-Memory-Implementierung zurueck statt hart zu blockieren.
--
-- Idempotent; manuell in Prod einspielen.
-- ============================================================================

create table if not exists public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);

-- RLS enabled, bewusst OHNE Policies: weder authenticated noch anon duerfen
-- diese Tabelle direkt lesen/schreiben. Nur die untenstehende SECURITY
-- DEFINER Funktion (und service_role, der RLS ohnehin umgeht) darf schreiben.
alter table public.rate_limit_counters enable row level security;

-- ----------------------------------------------------------------------------
-- check_rate_limit: atomarer Zaehl-und-Pruef-Schritt fuer ein festes
-- Zeitfenster. Race-sicher ohne explizites Locking – ON CONFLICT DO UPDATE
-- ist in Postgres atomar (Standardmuster fuer Zaehler).
-- ----------------------------------------------------------------------------
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

  insert into public.rate_limit_counters (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set hits = public.rate_limit_counters.hits + 1
  returning hits into v_hits;

  -- Gelegentliches Aufraeumen alter Fenster (analog maybeSweep in
  -- lib/rate-limit.ts) – kleine Zufallswahrscheinlichkeit pro Aufruf, damit
  -- nicht jeder Request die Tabelle scannt.
  if random() < 0.01 then
    delete from public.rate_limit_counters
    where window_start < now() - interval '1 hour';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- WICHTIG: nur der Service-Role-Client ruft diese Funktion auf
-- (lib/rate-limit.ts nutzt createServiceClient(), nie den User-Client). Ohne
-- dieses REVOKE waere check_rate_limit als oeffentliche REST-RPC aufrufbar –
-- jeder (auch anon) koennte mit einem beliebigen p_key und p_limit=0 fremde
-- Zaehler (z.B. "verify:<opfer-ip>") gezielt sperren. service_role ist von
-- REVOKE-auf-public nicht betroffen.
revoke execute on function public.check_rate_limit(text, int, int) from public;
revoke execute on function public.check_rate_limit(text, int, int) from anon;
revoke execute on function public.check_rate_limit(text, int, int) from authenticated;
