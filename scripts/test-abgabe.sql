-- ============================================================================
-- Test der atomaren Abgabe aus 043_abgabe_atomar.sql (Sicherheitstest T7)
-- ============================================================================
-- Läuft gegen eine WEGWERF-Datenbank mit allen Migrationen, nie gegen die
-- Produktion. Alles steckt in einer Transaktion, die am Ende zurückgerollt wird.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-abgabe.sql
--
-- Bricht beim ersten Fehler ab. Am Ende steht «ALLE ABGABE-TESTS BESTANDEN».
-- Gleichzeitige Abgaben (zwei Sitzungen) lassen sich in einer Transaktion
-- nicht nachstellen; dafür steht ein Ablauf im PR.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-0000000043a1', 'Testorganisation 043');
insert into public.companies (id, name, organization_id)
values ('00000000-0000-0000-0000-0000000043c1', 'Testfirma 043 AG',
        '00000000-0000-0000-0000-0000000043a1');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date)
values ('00000000-0000-0000-0000-0000000043e1', '00000000-0000-0000-0000-0000000043c1',
        'Test', 'Person', 'Sachbearbeitung', '2020-01-01');
insert into public.certificates (id, company_id, employee_id, type, status)
values
  ('00000000-0000-0000-0000-0000000043d1', '00000000-0000-0000-0000-0000000043c1',
   '00000000-0000-0000-0000-0000000043e1', 'schluss', 'pending_manager'),
  ('00000000-0000-0000-0000-0000000043d2', '00000000-0000-0000-0000-0000000043c1',
   '00000000-0000-0000-0000-0000000043e1', 'schluss', 'pending_manager');

-- Einladungen: A und B auf Zeugnis 1, C abgelaufen, D auf Zeugnis 2.
insert into public.manager_invitations (id, certificate_id, manager_email, token_hash, status, expires_at)
values
  ('00000000-0000-0000-0000-0000000043f1', '00000000-0000-0000-0000-0000000043d1', 'a@test.zeugnio.ch',
   encode(sha256(convert_to('tok-043-a', 'UTF8')), 'hex'), 'pending', now() + interval '14 days'),
  ('00000000-0000-0000-0000-0000000043f2', '00000000-0000-0000-0000-0000000043d1', 'b@test.zeugnio.ch',
   encode(sha256(convert_to('tok-043-b', 'UTF8')), 'hex'), 'viewed', now() + interval '14 days'),
  ('00000000-0000-0000-0000-0000000043f3', '00000000-0000-0000-0000-0000000043d1', 'c@test.zeugnio.ch',
   encode(sha256(convert_to('tok-043-c', 'UTF8')), 'hex'), 'pending', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000043f4', '00000000-0000-0000-0000-0000000043d2', 'd@test.zeugnio.ch',
   encode(sha256(convert_to('tok-043-d', 'UTF8')), 'hex'), 'pending', now() + interval '14 days');

-- Vorhandene Beurteilungen: Selbstbeurteilung (ohne Einladung) und Abgabe B.
insert into public.evaluations (certificate_id, invitation_id, submitted_by_email, category, subcategory, rating)
values
  ('00000000-0000-0000-0000-0000000043d1', null, 'hr@test.zeugnio.ch', 'arbeitsqualitaet', 'leistung', 'gut'),
  ('00000000-0000-0000-0000-0000000043d1', '00000000-0000-0000-0000-0000000043f2', 'b@test.zeugnio.ch',
   'arbeitsqualitaet', 'leistung', 'genuegend');

do $$
declare
  v_a text := encode(sha256(convert_to('tok-043-a', 'UTF8')), 'hex');
  v_b text := encode(sha256(convert_to('tok-043-b', 'UTF8')), 'hex');
  v_c text := encode(sha256(convert_to('tok-043-c', 'UTF8')), 'hex');
  v_d text := encode(sha256(convert_to('tok-043-d', 'UTF8')), 'hex');
  v_ok jsonb := '[{"category":"arbeitsqualitaet","subcategory":"leistung","rating":"sehr_gut","free_text":"Projekt X"},
                  {"category":"belastbarkeit","subcategory":"leistung","rating":"gut"}]';
  v_r text;
  v_n int;
begin
  -- 1. Eingaben (zweite Linie hinter dem TypeScript-Schema).
  if public.zeugnio_submit_manager_evaluation('kein-hash', v_ok) <> 'not_found' then
    raise exception 'T1: Hash im falschen Format nicht als not_found erkannt';
  end if;
  if public.zeugnio_submit_manager_evaluation(repeat('0', 64), v_ok) <> 'not_found' then
    raise exception 'T1b: unbekannter Hash nicht als not_found erkannt';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a, '{}'::jsonb) <> 'invalid' then
    raise exception 'T2: Objekt statt Liste angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a, '[]'::jsonb) <> 'invalid' then
    raise exception 'T3: leere Liste angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a, '[{"category":"x","rating":"hervorragend"}]') <> 'invalid' then
    raise exception 'T4: unbekannter Skalenwert angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a,
       jsonb_build_array(jsonb_build_object('category', 'x', 'rating', 'gut', 'free_text', repeat('a', 1001)))) <> 'invalid' then
    raise exception 'T5: überlanger Freitext angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a,
       '[{"category":"x","rating":"gut"},{"category":"x","rating":"sehr_gut"}]') <> 'invalid' then
    raise exception 'T6: doppelte Kategorie angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a,
       (select jsonb_agg(jsonb_build_object('category', 'k' || g, 'rating', 'gut')) from generate_series(1, 65) g)) <> 'invalid' then
    raise exception 'T7: 65 Einträge angenommen';
  end if;
  if public.zeugnio_submit_manager_evaluation(v_a, '[{"category":"Drop Table","rating":"gut"}]') <> 'invalid' then
    raise exception 'T8: Kategorie mit Sonderzeichen angenommen';
  end if;
  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f1';
  if v_n <> 0 then raise exception 'T9: ungültige Abgaben haben geschrieben (%)', v_n; end if;

  -- 2. Abgelaufen.
  if public.zeugnio_submit_manager_evaluation(v_c, v_ok) <> 'expired' then
    raise exception 'T10: abgelaufene Einladung nicht als expired erkannt';
  end if;

  -- 3. Gültige Abgabe über A: nur A schreibt, Selbstbeurteilung und B bleiben.
  v_r := public.zeugnio_submit_manager_evaluation(v_a, v_ok);
  if v_r <> 'ok' then raise exception 'T11: gültige Abgabe ergab %', v_r; end if;

  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f1';
  if v_n <> 2 then raise exception 'T12: erwartet 2 Einträge von A, gefunden %', v_n; end if;
  select count(*) into v_n from public.evaluations
   where certificate_id = '00000000-0000-0000-0000-0000000043d1' and invitation_id is null;
  if v_n <> 1 then raise exception 'T13: Selbstbeurteilung verschwunden (%)', v_n; end if;
  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f2';
  if v_n <> 1 then raise exception 'T14: Abgabe B verschwunden (%)', v_n; end if;

  if not exists (select 1 from public.evaluations
                  where invitation_id = '00000000-0000-0000-0000-0000000043f1'
                    and category = 'arbeitsqualitaet' and rating = 'sehr_gut'
                    and free_text = 'Projekt X' and submitted_by_email = 'a@test.zeugnio.ch'
                    and certificate_id = '00000000-0000-0000-0000-0000000043d1') then
    raise exception 'T15: Felder der Abgabe falsch gespeichert';
  end if;
  if (select free_text from public.evaluations
       where invitation_id = '00000000-0000-0000-0000-0000000043f1' and category = 'belastbarkeit') is not null then
    raise exception 'T16: fehlender Freitext nicht als null gespeichert';
  end if;

  if (select status from public.manager_invitations where id = '00000000-0000-0000-0000-0000000043f1') <> 'submitted'
     or (select submitted_at from public.manager_invitations where id = '00000000-0000-0000-0000-0000000043f1') is null then
    raise exception 'T17: Einladung A nicht auf submitted';
  end if;
  if (select status from public.certificates where id = '00000000-0000-0000-0000-0000000043d1') <> 'manager_submitted' then
    raise exception 'T18: Zeugnisstatus nicht auf manager_submitted';
  end if;
  if (select status from public.manager_invitations where id = '00000000-0000-0000-0000-0000000043f2') <> 'viewed' then
    raise exception 'T19: Einladung B wurde mitverändert';
  end if;

  -- 4. Zweite Abgabe über A: abgewiesen, nichts geändert.
  if public.zeugnio_submit_manager_evaluation(v_a, '[{"category":"belastbarkeit","rating":"ungenuegend"}]') <> 'already_submitted' then
    raise exception 'T20: zweite Abgabe nicht abgewiesen';
  end if;
  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f1';
  if v_n <> 2 then raise exception 'T21: zweite Abgabe hat geschrieben (%)', v_n; end if;

  -- 5. Abgabe über B ersetzt nur die eigenen (alten) Einträge von B.
  if public.zeugnio_submit_manager_evaluation(v_b, '[{"category":"belastbarkeit","rating":"gut"}]') <> 'ok' then
    raise exception 'T22: Abgabe B abgewiesen';
  end if;
  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f2';
  if v_n <> 1 or not exists (select 1 from public.evaluations
                              where invitation_id = '00000000-0000-0000-0000-0000000043f2'
                                and category = 'belastbarkeit') then
    raise exception 'T23: alte Einträge von B nicht ersetzt';
  end if;
  select count(*) into v_n from public.evaluations where invitation_id = '00000000-0000-0000-0000-0000000043f1';
  if v_n <> 2 then raise exception 'T24: Abgabe B hat Einträge von A angefasst (%)', v_n; end if;

  -- 6. Versiegeltes Zeugnis: abgewiesen (H1 bleibt).
  update public.certificates set status = 'final' where id = '00000000-0000-0000-0000-0000000043d2';
  if public.zeugnio_submit_manager_evaluation(v_d, v_ok) <> 'locked' then
    raise exception 'T25: Abgabe auf finales Zeugnis nicht abgewiesen';
  end if;
  select count(*) into v_n from public.evaluations where certificate_id = '00000000-0000-0000-0000-0000000043d2';
  if v_n <> 0 then raise exception 'T26: Abgabe auf finales Zeugnis hat geschrieben (%)', v_n; end if;
  if (select status from public.manager_invitations where id = '00000000-0000-0000-0000-0000000043f4') <> 'pending' then
    raise exception 'T27: Einladung auf finalem Zeugnis verändert';
  end if;

  raise notice 'Abgabe-Logik: 27 Prüfungen bestanden';
end;
$$;

-- 7. Rechte: anon und authenticated dürfen die Funktion nicht aufrufen.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.zeugnio_submit_manager_evaluation(text, jsonb)', 'execute') then
    raise exception 'R1: anon darf die Abgabefunktion aufrufen';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', 'public.zeugnio_submit_manager_evaluation(text, jsonb)', 'execute') then
    raise exception 'R2: authenticated darf die Abgabefunktion aufrufen';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', 'public.zeugnio_submit_manager_evaluation(text, jsonb)', 'execute') then
    raise exception 'R3: service_role darf die Abgabefunktion nicht aufrufen';
  end if;
  raise notice 'Rechte: 3 Prüfungen bestanden';
end;
$$;

rollback;

\echo 'ALLE ABGABE-TESTS BESTANDEN'
