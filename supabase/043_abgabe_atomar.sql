-- ============================================================================
-- 043_abgabe_atomar.sql
-- Sicherheitstest 24.11.2026, Befund T7: Abgabe der vorgesetzten Person härten.
-- ============================================================================
--
-- PROBLEM
--
-- app/api/evaluations/submit schrieb in vier getrennten Aufrufen: Einladung
-- lesen und «schon abgegeben?» prüfen, ALLE Beurteilungen des Zeugnisses
-- löschen, neue einfügen, Einladung auf 'submitted' setzen. Daraus folgten:
--
--   1. Zwei gleichzeitige Abgaben über denselben Link sahen beide «noch offen»
--      und schrieben beide. Ein Fehler zwischen den Schritten liess halbe
--      Zustände zurück (gelöscht, aber nichts eingefügt).
--   2. Das Löschen traf auch Beurteilungen, die nicht zu dieser Einladung
--      gehören: die Selbstbeurteilung der Personalabteilung und Abgaben über
--      andere Einladungen.
--
-- LÖSUNG
--
-- Eine Funktion erledigt die ganze Abgabe in EINER Transaktion:
--
--   - Sie sperrt zuerst die Zeile des Zeugnisses (FOR NO KEY UPDATE), dann die
--     der Einladung (FOR UPDATE). Dieselbe Reihenfolge wie beim Finalisieren
--     (Zeugnis, dann Einladungen), damit sich beide nicht gegenseitig
--     blockieren. Eine zweite Abgabe über denselben Link wartet an der Sperre
--     und sieht danach 'submitted'.
--   - Sie prüft Ablauf, Status der Einladung und Sperre des Zeugnisses
--     (final/revoked, wie lib/certificate/status.ts) erst UNTER der Sperre.
--   - Sie ersetzt nur die Beurteilungen mit der eigenen invitation_id.
--   - Sie setzt Einladung und Zeugnisstatus im selben Zug.
--
-- Welche Beurteilungen der Generator nimmt, wenn mehrere Sätze vorliegen,
-- regelt lib/evaluations/latest-set.ts (der jüngste Satz zählt, wie bisher).
--
-- Die Eingaben prüft die Route vorher mit einem strikten Schema
-- (lib/evaluations/submission.ts). Die Funktion prüft die Grenzen ein zweites
-- Mal und meldet 'invalid', statt einen rohen Datenbankfehler zu werfen.
--
-- Rückgabe (text): 'ok' | 'not_found' | 'expired' | 'already_submitted' |
-- 'locked' | 'invalid'. Die Route übersetzt das in HTTP-Antworten.
--
-- RECHTE
--
-- SECURITY INVOKER: Die Funktion läuft mit den Rechten der aufrufenden Rolle.
-- Aufrufen darf nur service_role (Server-Route). Neue Funktionen hätten sonst
-- EXECUTE für PUBLIC, darum die REVOKEs unten.
--
-- EINSPIELEN
--
-- Läuft beim Deploy über scripts/migrate.mjs. Keine neue Tabelle,
-- 901_nine_rechte.sql ist nicht nötig. Der neue Code ruft die Funktion auf;
-- ohne diese Migration schlägt jede Abgabe mit einer allgemeinen Meldung fehl.
-- Darum Migration vor dem Neustart der App (deploy.sh macht das so).
--
-- Bestehende Daten werden nicht verändert. Idempotent.
-- ============================================================================

create or replace function public.zeugnio_submit_manager_evaluation(
  p_token_hash text,
  p_evaluations jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cert_id uuid;
  v_cert_status public.certificate_status;
  v_inv public.manager_invitations%rowtype;
  v_count int;
begin
  -- Eingaben (zweite Linie hinter lib/evaluations/submission.ts).
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'not_found';
  end if;

  if p_evaluations is null or jsonb_typeof(p_evaluations) <> 'array' then
    return 'invalid';
  end if;
  v_count := jsonb_array_length(p_evaluations);
  if v_count < 1 or v_count > 64 then
    return 'invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_evaluations) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e->>'category', '') !~ '^[a-z0-9_]{1,64}$'
       or (e->>'subcategory') is not null and (e->>'subcategory') !~ '^[a-z0-9_]{1,64}$'
       or coalesce(e->>'rating', '') not in ('ungenuegend', 'genuegend', 'gut', 'sehr_gut')
       or char_length(coalesce(e->>'free_text', '')) > 1000
  ) then
    return 'invalid';
  end if;

  if (select count(distinct e->>'category') from jsonb_array_elements(p_evaluations) e) <> v_count then
    return 'invalid';
  end if;

  -- Zeugnis zur Einladung finden, dann in fester Reihenfolge sperren.
  select certificate_id into v_cert_id
  from public.manager_invitations
  where token_hash = p_token_hash;
  if not found then
    return 'not_found';
  end if;

  select status into v_cert_status
  from public.certificates
  where id = v_cert_id
  for no key update;

  select * into v_inv
  from public.manager_invitations
  where token_hash = p_token_hash
  for update;
  if not found or v_inv.certificate_id <> v_cert_id then
    return 'not_found';
  end if;

  -- Prüfungen unter der Sperre.
  if v_inv.expires_at < now() then
    return 'expired';
  end if;
  if v_inv.status = 'submitted' then
    return 'already_submitted';
  end if;
  if v_cert_status is null or v_cert_status in ('final', 'revoked') then
    return 'locked';
  end if;

  -- Nur die eigenen Einträge ersetzen. Leer ausser bei Resten aus der Zeit vor
  -- 043, als Einfügen und Statuswechsel getrennt liefen.
  delete from public.evaluations
  where invitation_id = v_inv.id;

  insert into public.evaluations
    (certificate_id, invitation_id, submitted_by_email, category, subcategory, rating, free_text)
  select
    v_inv.certificate_id,
    v_inv.id,
    v_inv.manager_email,
    e->>'category',
    e->>'subcategory',
    (e->>'rating')::public.rating_value,
    nullif(e->>'free_text', '')
  from jsonb_array_elements(p_evaluations) with ordinality as x(e, n)
  order by n;

  update public.manager_invitations
  set status = 'submitted', submitted_at = now()
  where id = v_inv.id;

  update public.certificates
  set status = 'manager_submitted'
  where id = v_cert_id
    and status in ('draft', 'pending_manager', 'manager_submitted');

  return 'ok';
end;
$$;

revoke all on function public.zeugnio_submit_manager_evaluation(text, jsonb) from public;
revoke all on function public.zeugnio_submit_manager_evaluation(text, jsonb) from anon;
revoke all on function public.zeugnio_submit_manager_evaluation(text, jsonb) from authenticated;

-- service_role gibt es auf nine (900_0) und bei Supabase. Auf einer nackten
-- Test-Datenbank ohne die Rolle wird das Grant übersprungen.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.zeugnio_submit_manager_evaluation(text, jsonb) to service_role';
  end if;
end;
$$;

comment on function public.zeugnio_submit_manager_evaluation(text, jsonb) is
  'T7 (043): Abgabe der vorgesetzten Person atomar; ersetzt nur die Einträge der eigenen Einladung.';

-- PostgREST soll die neue Funktion kennen. Ohne Zuhörer wirkungslos;
-- deploy.sh liest das Schema ohnehin neu ein.
notify pgrst, 'reload schema';
