-- ============================================================================
-- Test der Freigabe-Bindung aus 041_freigabe_an_text.sql (Sicherheitstest M3)
-- ============================================================================
-- Läuft gegen eine WEGWERF-Datenbank mit allen Migrationen, nie gegen die
-- Produktion. Alles steckt in einer Transaktion, die am Ende zurückgerollt wird.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-signoff-binding.sql
--
-- Bricht beim ersten Fehler ab. Am Ende steht «ALLE FREIGABE-TESTS BESTANDEN».
-- ============================================================================

\set ON_ERROR_STOP on
begin;

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-0000000004a1', 'Testorganisation 041');
insert into public.companies (id, name, organization_id)
values ('00000000-0000-0000-0000-0000000004c1', 'Testfirma 041 AG',
        '00000000-0000-0000-0000-0000000004a1');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date)
values ('00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004c1',
        'Test', 'Person', 'Sachbearbeitung', '2020-01-01');
insert into public.certificates (id, company_id, employee_id, type, generated_text)
values ('00000000-0000-0000-0000-0000000004d1', '00000000-0000-0000-0000-0000000004c1',
        '00000000-0000-0000-0000-0000000004e1', 'schluss', 'Text A');

-- Zwei Altzeilen von vor 041: bestätigt, ohne Hash (Trigger kurz aus, so wie
-- es vor 041 in der Datenbank lag).
alter table public.certificate_signoffs disable trigger enforce_signoff_binding;
insert into public.certificate_signoffs
  (id, certificate_id, slot, email, name, role, token_hash, status, confirmed_at,
   confirmed_ip, expires_at)
values
  ('00000000-0000-0000-0000-0000000004f2', '00000000-0000-0000-0000-0000000004d1', 2,
   'zwei@test.zeugnio.ch', 'Carl Muster', null, encode(sha256(convert_to('tok-041-alt', 'UTF8')), 'hex'), 'confirmed', now(),
   '192.0.2.1', now() + interval '14 days');
alter table public.certificate_signoffs enable trigger enforce_signoff_binding;

-- Eine offene Anfrage.
insert into public.certificate_signoffs
  (id, certificate_id, slot, email, name, role, token_hash, status, expires_at)
values
  ('00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004d1', 1,
   'eins@test.zeugnio.ch', 'Anna Beispiel', 'Leiterin HR', encode(sha256(convert_to('tok-041', 'UTF8')), 'hex'), 'pending',
   now() + interval '14 days');

do $$
declare
  v_hash text := encode(sha256(convert_to('Text A', 'UTF8')), 'hex');
  v_ok boolean;
begin
  -- 1. Bestätigen ohne Hash: abgewiesen.
  begin
    update public.certificate_signoffs set status = 'confirmed', confirmed_at = now()
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T1: Bestätigung ohne Hash wurde angenommen';
  exception when check_violation then null;
  end;

  -- 2. Bestätigen mit Hash, aber ohne Namen: abgewiesen.
  begin
    update public.certificate_signoffs
    set status = 'confirmed', confirmed_at = now(), confirmed_text_hash = v_hash
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T2: Bestätigung ohne Namen wurde angenommen';
  exception when check_violation then null;
  end;

  -- 3. Hash in falschem Format: abgewiesen (Constraint).
  begin
    update public.certificate_signoffs
    set status = 'confirmed', confirmed_at = now(), confirmed_text_hash = upper(v_hash),
        confirmed_name = 'Anna Beispiel'
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T3: Hash in Grossbuchstaben wurde angenommen';
  exception when check_violation then null;
  end;

  -- 4. Bestätigen mit Hash und Namen: angenommen.
  update public.certificate_signoffs
  set status = 'confirmed', confirmed_at = now(), confirmed_text_hash = v_hash,
      confirmed_name = 'Anna Beispiel', confirmed_role = 'Leiterin HR'
  where id = '00000000-0000-0000-0000-0000000004f1';

  -- 5. Hash nachträglich auf einen anderen Text umbiegen: abgewiesen.
  begin
    update public.certificate_signoffs
    set confirmed_text_hash = encode(sha256(convert_to('Text B', 'UTF8')), 'hex')
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T5: Hash einer Bestätigung liess sich ändern';
  exception when check_violation then null;
  end;

  -- 6. Namen nachträglich ändern: abgewiesen.
  begin
    update public.certificate_signoffs set confirmed_name = 'Bea Beispiel'
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T6: Name einer Bestätigung liess sich ändern';
  exception when check_violation then null;
  end;

  -- 7. Bindung entfernen und bestätigt lassen: abgewiesen.
  begin
    update public.certificate_signoffs set confirmed_text_hash = null
    where id = '00000000-0000-0000-0000-0000000004f1';
    raise exception 'T7: Bindung liess sich entfernen';
  exception when check_violation then null;
  end;

  -- 8. Löschlauf (pii-cleanup) auf gebundener Zeile: erlaubt.
  update public.certificate_signoffs set confirmed_ip = null, confirmed_user_agent = null
  where id = '00000000-0000-0000-0000-0000000004f1';

  -- 9. Löschlauf auf Altzeile ohne Hash: erlaubt.
  update public.certificate_signoffs set confirmed_ip = null, confirmed_user_agent = null
  where id = '00000000-0000-0000-0000-0000000004f2';
  select confirmed_ip is null into v_ok from public.certificate_signoffs
  where id = '00000000-0000-0000-0000-0000000004f2';
  if not v_ok then raise exception 'T9: Altzeile nicht anonymisiert'; end if;

  -- 10. Neu anfordern (wie app/api/certificates/[id]/signoff): erlaubt.
  update public.certificate_signoffs
  set status = 'pending', token_hash = encode(sha256(convert_to('tok-041-neu', 'UTF8')), 'hex'), confirmed_at = null,
      confirmed_text_hash = null, confirmed_name = null, confirmed_role = null
  where id = '00000000-0000-0000-0000-0000000004f1';

  -- 11. Insert direkt als bestätigt ohne Hash: abgewiesen.
  begin
    insert into public.certificate_signoffs
      (certificate_id, slot, email, name, token_hash, status, confirmed_at, expires_at)
    values ('00000000-0000-0000-0000-0000000004d1', 2, 'x@test.zeugnio.ch', 'X',
            encode(sha256(convert_to('tok-041-x', 'UTF8')), 'hex'), 'confirmed', now(), now() + interval '1 day')
    on conflict (certificate_id, slot) do nothing;
    -- Konflikt auf Slot 2 (Altzeile) unterdrückt den Insert nicht vor dem
    -- BEFORE-INSERT-Trigger: Der Trigger muss trotzdem greifen.
    raise exception 'T11: Insert als bestätigt ohne Hash wurde angenommen';
  exception when check_violation then null;
  end;

  -- 12. SQL-Hash über canonical_content = JS-Hash (UTF-8, hex, klein).
  if encode(sha256(convert_to('Müller – «stets»', 'UTF8')), 'hex')
     <> '8349817cbc62ed7924028f510ba3b2eff55a8b3df5e82f883e91a5a770b3103b' then
    raise exception 'T12: SQL- und JS-Hash weichen ab';
  end if;
end;
$$;

select 'ALLE FREIGABE-TESTS BESTANDEN' as ergebnis;
rollback;
