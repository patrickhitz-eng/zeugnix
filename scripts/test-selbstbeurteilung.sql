-- ============================================================================
-- Test der atomaren Selbstbeurteilung aus 046_selbstbeurteilung_atomar.sql
-- ============================================================================
-- Läuft gegen eine WEGWERF-Datenbank mit allen Migrationen, nie gegen die
-- Produktion. Alles steckt in einer Transaktion, die am Ende zurückgerollt wird.
-- Die Funktion läuft wie in der App als angemeldete Person (authenticated) und
-- unterliegt damit der Zeilensicherheit.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-selbstbeurteilung.sql
--
-- Bricht beim ersten Fehler ab. Am Ende steht «ALLE SELBSTBEURTEILUNGS-TESTS BESTANDEN».
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- Personen: A Admin, R nur Lesen, X fremd (eigene Organisation).
insert into auth.users (id, email) values
  ('46000000-0000-0000-0000-00000000000a', 'admin@selbst.test.zeugnio.ch'),
  ('46000000-0000-0000-0000-0000000000b3', 'lesen@selbst.test.zeugnio.ch'),
  ('46000000-0000-0000-0000-0000000000ff', 'fremd@selbst.test.zeugnio.ch');
insert into public.profiles (id, email)
select id, email from auth.users where email like '%@selbst.test.zeugnio.ch'
on conflict (id) do nothing;

-- A legt Firma, Person und zwei Zeugnisse an.
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('46000000-0000-0000-0000-0000000000c1', 'Selbst AG', '46000000-0000-0000-0000-00000000000a');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date) values
  ('46000000-0000-0000-0000-0000000000e1', '46000000-0000-0000-0000-0000000000c1', 'Test', 'Person', 'Sachbearbeitung', '2020-01-01');
insert into public.certificates (id, company_id, employee_id, type, created_by_user_id) values
  ('46000000-0000-0000-0000-0000000000f1', '46000000-0000-0000-0000-0000000000c1', '46000000-0000-0000-0000-0000000000e1', 'schluss', '46000000-0000-0000-0000-00000000000a'),
  ('46000000-0000-0000-0000-0000000000f2', '46000000-0000-0000-0000-0000000000c1', '46000000-0000-0000-0000-0000000000e1', 'schluss', '46000000-0000-0000-0000-00000000000a');
reset role;
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('46000000-0000-0000-0000-0000000000c9', 'Fremd AG', '46000000-0000-0000-0000-0000000000ff');
reset role;
-- Ab hier ohne Anmeldung, wie die Serverrolle (sonst prüft der Siegel-Trigger
-- die zuletzt gesetzte Person).
select set_config('request.jwt.claims', '{}', true);

-- R ist Mitglied mit Leserecht.
insert into public.organization_members (organization_id, user_id, role)
select c.organization_id, '46000000-0000-0000-0000-0000000000b3', 'mitglied'
from public.companies c where c.id = '46000000-0000-0000-0000-0000000000c1';
insert into public.company_members (company_id, user_id, access_role) values
  ('46000000-0000-0000-0000-0000000000c1', '46000000-0000-0000-0000-0000000000b3', 'lesen');

-- Eine Abgabe über eine Einladung liegt schon vor (Serverrolle, wie in der App).
insert into public.manager_invitations (id, certificate_id, manager_email, token_hash, status, expires_at, submitted_at)
values ('46000000-0000-0000-0000-0000000000a1', '46000000-0000-0000-0000-0000000000f1', 'chef@selbst.test.zeugnio.ch',
        encode(sha256(convert_to('tok-046', 'UTF8')), 'hex'), 'submitted', now() + interval '14 days', now());
insert into public.evaluations (certificate_id, invitation_id, submitted_by_email, category, subcategory, rating)
values ('46000000-0000-0000-0000-0000000000f1', '46000000-0000-0000-0000-0000000000a1',
        'chef@selbst.test.zeugnio.ch', 'arbeitsqualitaet', 'leistung', 'gut');

-- Zeugnis 2 ist finalisiert.
update public.certificates set status = 'final' where id = '46000000-0000-0000-0000-0000000000f2';

-- ---------------------------------------------------------------------------
-- 1. Als Admin A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  f1 uuid := '46000000-0000-0000-0000-0000000000f1';
  f2 uuid := '46000000-0000-0000-0000-0000000000f2';
  v_two jsonb := '[{"category":"arbeitsqualitaet","subcategory":"leistung","rating":"sehr_gut","free_text":"Projekt X"},
                   {"category":"belastbarkeit","subcategory":"leistung","rating":"gut"}]';
  v_r text;
  v_n int;
begin
  if public.zeugnio_save_self_evaluation(f1, 'admin@selbst.test.zeugnio.ch', '[]') <> 'invalid' then
    raise exception 'S1: leere Liste angenommen';
  end if;
  if public.zeugnio_save_self_evaluation(f1, 'admin@selbst.test.zeugnio.ch',
       '[{"category":"x","rating":"gut"},{"category":"x","rating":"gut"}]') <> 'invalid' then
    raise exception 'S2: doppelte Kategorie angenommen';
  end if;
  if public.zeugnio_save_self_evaluation(f1, '', v_two) <> 'invalid' then
    raise exception 'S3: leere Mailadresse angenommen';
  end if;
  if public.zeugnio_save_self_evaluation('46000000-0000-0000-0000-0000000000f9', 'a@b', v_two) <> 'not_found' then
    raise exception 'S4: unbekanntes Zeugnis nicht als not_found erkannt';
  end if;

  v_r := public.zeugnio_save_self_evaluation(f1, 'admin@selbst.test.zeugnio.ch', v_two);
  if v_r <> 'ok' then raise exception 'S5: Selbstbeurteilung ergab %', v_r; end if;
  select count(*) into v_n from public.evaluations where certificate_id = f1 and invitation_id is null;
  if v_n <> 2 then raise exception 'S6: erwartet 2 eigene Einträge, gefunden %', v_n; end if;
  select count(*) into v_n from public.evaluations where certificate_id = f1 and invitation_id is not null;
  if v_n <> 1 then raise exception 'S7: Abgabe über die Einladung verschwunden (%)', v_n; end if;
  if (select status from public.certificates where id = f1) <> 'manager_submitted' then
    raise exception 'S8: Status nicht auf manager_submitted';
  end if;

  -- Zweites Speichern ersetzt nur die Selbstbeurteilung.
  if public.zeugnio_save_self_evaluation(f1, 'admin@selbst.test.zeugnio.ch',
       '[{"category":"belastbarkeit","rating":"genuegend"}]') <> 'ok' then
    raise exception 'S9: zweites Speichern abgewiesen';
  end if;
  select count(*) into v_n from public.evaluations where certificate_id = f1 and invitation_id is null;
  if v_n <> 1 then raise exception 'S10: Selbstbeurteilung nicht ersetzt (%)', v_n; end if;
  select count(*) into v_n from public.evaluations where certificate_id = f1 and invitation_id is not null;
  if v_n <> 1 then raise exception 'S11: zweites Speichern hat die Einladungs-Abgabe angefasst (%)', v_n; end if;

  -- Finalisiertes Zeugnis.
  if public.zeugnio_save_self_evaluation(f2, 'admin@selbst.test.zeugnio.ch', v_two) <> 'locked' then
    raise exception 'S12: finales Zeugnis nicht abgewiesen';
  end if;
  select count(*) into v_n from public.evaluations where certificate_id = f2;
  if v_n <> 0 then raise exception 'S13: finales Zeugnis hat Beurteilungen bekommen (%)', v_n; end if;

  raise notice 'Admin: 13 Prüfungen bestanden';
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Nur Leserecht und fremde Organisation: kein Schreiben.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_r text;
begin
  v_r := public.zeugnio_save_self_evaluation('46000000-0000-0000-0000-0000000000f1', 'lesen@selbst.test.zeugnio.ch',
           '[{"category":"belastbarkeit","rating":"ungenuegend"}]');
  if v_r not in ('not_found', 'forbidden') then
    raise exception 'S14: Leserecht durfte speichern (%)', v_r;
  end if;
  raise notice 'Leserecht: abgewiesen mit %', v_r;
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_r text;
begin
  v_r := public.zeugnio_save_self_evaluation('46000000-0000-0000-0000-0000000000f1', 'fremd@selbst.test.zeugnio.ch',
           '[{"category":"belastbarkeit","rating":"ungenuegend"}]');
  if v_r <> 'not_found' then
    raise exception 'S15: fremde Organisation erhielt % statt not_found', v_r;
  end if;
  raise notice 'Fremd: abgewiesen mit not_found';
end;
$$;
reset role;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.evaluations
   where certificate_id = '46000000-0000-0000-0000-0000000000f1' and rating = 'ungenuegend';
  if v_n <> 0 then raise exception 'S16: Abgewiesene haben geschrieben (%)', v_n; end if;

  -- Rechte.
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.zeugnio_save_self_evaluation(uuid, text, jsonb)', 'execute') then
    raise exception 'R1: anon darf die Funktion aufrufen';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and not has_function_privilege('authenticated', 'public.zeugnio_save_self_evaluation(uuid, text, jsonb)', 'execute') then
    raise exception 'R2: authenticated darf die Funktion nicht aufrufen';
  end if;
  raise notice 'Schreibschutz und Rechte: 3 Prüfungen bestanden';
end;
$$;

rollback;

\echo 'ALLE SELBSTBEURTEILUNGS-TESTS BESTANDEN'
