-- ============================================================================
-- 046_selbstbeurteilung_atomar.sql
-- Folge zu Sicherheitstest 24.11.2026, Befund T7 (043): Selbstbeurteilung der
-- Personalabteilung wie die Abgabe über den Einladungslink härten.
-- (044 Rechte-Gruppe, 045 Hash-Gruppe reserviert.)
-- ============================================================================
--
-- PROBLEM
--
-- app/api/certificates/[id]/evaluate-self schrieb in drei getrennten
-- Aufrufen: ALLE Beurteilungen des Zeugnisses löschen (auch die Abgaben der
-- vorgesetzten Personen), neue einfügen, Status setzen. Ein Fehler zwischen
-- den Schritten liess das Zeugnis ohne Beurteilung zurück. Zwei Speichervorgänge
-- gleichzeitig konnten sich mischen. Versiegelte Zeugnisse wurden nicht vorab
-- abgewiesen: Die Beurteilungen waren schon ersetzt, bevor der Statuswechsel
-- am Siegel-Trigger scheiterte.
--
-- LÖSUNG
--
-- Eine Funktion erledigt das Speichern in EINER Transaktion:
--
--   - Sie sperrt die Zeile des Zeugnisses (FOR NO KEY UPDATE). Zwei
--     Speichervorgänge zum selben Zeugnis laufen nacheinander.
--   - Sie weist versiegelte Zeugnisse (final/revoked) ab, bevor sie schreibt.
--   - Sie ersetzt nur die Selbstbeurteilung (invitation_id is null). Abgaben
--     über Einladungen bleiben stehen; welcher Satz gilt, regelt
--     lib/evaluations/latest-set.ts (der jüngste, wie bisher).
--   - Sie setzt den Status nur aus einem offenen Zustand auf manager_submitted.
--
-- RECHTE
--
-- SECURITY INVOKER: Die Funktion läuft als angemeldete Person (authenticated)
-- und unterliegt der Zeilensicherheit aus 033/035. Ohne Bearbeitungsrecht
-- sieht sie das Zeugnis gar nicht ('not_found') oder scheitert an
-- zeugnio_can_edit ('forbidden'). Sie kann nichts, was die Person nicht schon
-- mit direkten Schreibrechten auf evaluations dürfte, macht es aber atomar.
-- EXECUTE für authenticated und service_role, nicht für anon und PUBLIC.
--
-- Rückgabe (text): 'ok' | 'not_found' | 'forbidden' | 'locked' | 'invalid'.
--
-- EINSPIELEN
--
-- Läuft beim Deploy über scripts/migrate.mjs. Keine neue Tabelle. Setzt 043
-- nicht voraus. Der neue Code ruft die Funktion auf; Migration vor dem
-- Neustart der App (deploy.sh macht das so). Idempotent.
-- ============================================================================

create or replace function public.zeugnio_save_self_evaluation(
  p_certificate_id uuid,
  p_submitted_by_email text,
  p_evaluations jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.certificate_status;
  v_company_id uuid;
  v_count int;
begin
  -- Eingaben (zweite Linie hinter lib/evaluations/submission.ts).
  if p_certificate_id is null then
    return 'not_found';
  end if;
  if p_submitted_by_email is null or char_length(p_submitted_by_email) not between 1 and 320 then
    return 'invalid';
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

  -- Sperre. Die Zeilensicherheit blendet Zeugnisse ohne Bearbeitungsrecht aus.
  select status, company_id into v_status, v_company_id
  from public.certificates
  where id = p_certificate_id
  for no key update;
  if not found then
    return 'not_found';
  end if;

  if not public.zeugnio_can_edit(v_company_id) then
    return 'forbidden';
  end if;
  if v_status in ('final', 'revoked') then
    return 'locked';
  end if;

  -- Nur die Selbstbeurteilung ersetzen.
  delete from public.evaluations
  where certificate_id = p_certificate_id
    and invitation_id is null;

  insert into public.evaluations
    (certificate_id, invitation_id, submitted_by_email, category, subcategory, rating, free_text)
  select
    p_certificate_id,
    null,
    p_submitted_by_email,
    e->>'category',
    e->>'subcategory',
    (e->>'rating')::public.rating_value,
    nullif(e->>'free_text', '')
  from jsonb_array_elements(p_evaluations) with ordinality as x(e, n)
  order by n;

  update public.certificates
  set status = 'manager_submitted'
  where id = p_certificate_id
    and status in ('draft', 'pending_manager', 'manager_submitted');

  return 'ok';
end;
$$;

revoke all on function public.zeugnio_save_self_evaluation(uuid, text, jsonb) from public;
revoke all on function public.zeugnio_save_self_evaluation(uuid, text, jsonb) from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.zeugnio_save_self_evaluation(uuid, text, jsonb) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.zeugnio_save_self_evaluation(uuid, text, jsonb) to service_role';
  end if;
end;
$$;

comment on function public.zeugnio_save_self_evaluation(uuid, text, jsonb) is
  'Folge T7 (046): Selbstbeurteilung atomar; ersetzt nur Einträge ohne Einladung.';

-- PostgREST soll die neue Funktion kennen. Ohne Zuhörer wirkungslos;
-- deploy.sh liest das Schema ohnehin neu ein.
notify pgrst, 'reload schema';
