-- ============================================================================
-- Test für Löschen und Prüfregister (036_loeschen_register.sql)
-- ============================================================================
-- Läuft gegen eine WEGWERF-Datenbank mit allen Migrationen, nie gegen die
-- Produktion. Alles steckt in einer Transaktion, die am Ende zurückgerollt wird.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-loeschen.sql
--
-- Am Ende steht «ALLE LÖSCHTESTS BESTANDEN».
-- Wer handelt, bestimmt request.jwt.claims (sub = Profil-ID), wie bei PostgREST.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- Personen: A Admin · HL HR-Leitung · H HR
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b1', 'leitung@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b2', 'hr@test.zeugnio.ch');
insert into public.profiles (id, email)
select id, email from auth.users where email like '%@test.zeugnio.ch'
on conflict (id) do nothing;

-- A legt Firma 1 an (erzeugt die Organisation) und Firma 2.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Löschtest Eins AG', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000c2', 'Löschtest Zwei AG', '00000000-0000-0000-0000-00000000000a');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Erika', 'Muster', 'Sachbearbeiterin', '2020-01-01'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Max', 'Beispiel', 'Buchhalter', '2019-01-01'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', 'Lea', 'Zweite', 'Assistentin', '2021-01-01');
reset role;

-- Ausgestellte Zeugnisse direkt (ohne Sitzung greift der Siegel-Wächter nicht).
insert into public.certificates
  (id, company_id, employee_id, type, status, hash, hash_version, canonical_content, meta_snapshot,
   signature, signing_key_id, finalized_at, created_by_user_id)
values
  -- f1: v2, final
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   'schluss', 'final', repeat('1', 64), 2, 'Erika Muster war bei uns als Sachbearbeiterin tätig.',
   '{"employer":"Löschtest Eins AG (Siegel)","documentTitle":"Arbeitszeugnis"}'::jsonb,
   'c2lnbmF0dXI=', 'zeugnio-test', '2026-01-15T10:00:00Z', '00000000-0000-0000-0000-00000000000a'),
  -- f3: v1, widerrufen
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2',
   'zwischen', 'final', repeat('3', 64), 1, null, null,
   null, null, '2025-06-01T10:00:00Z', '00000000-0000-0000-0000-00000000000a'),
  -- f5: v2, final, Firma 2
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e3',
   'schluss', 'final', repeat('5', 64), 2, 'Lea Zweite.',
   '{"employer":"Löschtest Zwei AG","documentTitle":"Arbeitszeugnis"}'::jsonb,
   null, null, '2026-02-01T10:00:00Z', '00000000-0000-0000-0000-00000000000a');
update public.certificates set status = 'revoked', revoked_at = '2026-03-01T10:00:00Z',
  revoked_by_user_id = '00000000-0000-0000-0000-00000000000a', revocation_reason = 'Test'
where id = '00000000-0000-0000-0000-0000000000f3';
-- f2: Entwurf von e1
insert into public.certificates (id, company_id, employee_id, type, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'schluss', '00000000-0000-0000-0000-00000000000a');
insert into public.company_domains (company_id, domain, status, verified_at)
values ('00000000-0000-0000-0000-0000000000c1', 'loeschtest.ch', 'verified', now());

-- Mitglieder wie nach einer Einladung.
insert into public.organization_members (organization_id, user_id, role)
select c.organization_id, u.id, 'mitglied'
from public.companies c, auth.users u
where c.id = '00000000-0000-0000-0000-0000000000c1'
  and u.email in ('leitung@test.zeugnio.ch', 'hr@test.zeugnio.ch');
insert into public.company_members (company_id, user_id, access_role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'hr_leitung'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'hr');

-- ---------------------------------------------------------------------------
-- 1. HR: kein ausgestelltes Zeugnis löschen, keine Person mit Zeugnis, keine RPC.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    delete from public.certificates where id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FEHLER: HR hat ein finales Zeugnis gelöscht';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.employees where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FEHLER: HR hat eine Person mit finalem Zeugnis gelöscht (Kaskade)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.zeugnio_delete_employee('00000000-0000-0000-0000-0000000000e1');
    raise exception 'FEHLER: HR darf zeugnio_delete_employee nicht';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.zeugnio_delete_company('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FEHLER: HR darf zeugnio_delete_company nicht';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.certificate_register;
    raise exception 'FEHLER: HR liest das Prüfregister';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.zeugnio_purge_company('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FEHLER: zeugnio_purge_company ist für authenticated aufrufbar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.zeugnio_delete_account('00000000-0000-0000-0000-0000000000b2');
    raise exception 'FEHLER: zeugnio_delete_account ist für authenticated aufrufbar';
  exception when insufficient_privilege then null;
  end;
  -- Ein Entwurf bleibt löschbar.
  delete from public.certificates where id = '00000000-0000-0000-0000-0000000000f2';
  if found is false then raise exception 'FEHLER: HR muss einen Entwurf löschen können'; end if;
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.certificates where id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FEHLER: f1 ist trotz Sperre weg';
  end if;
  if exists (select 1 from public.certificate_register where certificate_id = '00000000-0000-0000-0000-0000000000f2') then
    raise exception 'FEHLER: ein Entwurf darf nicht ins Register';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. HR-Leitung löscht Person e1 samt Zeugnis f1 -> Registereintrag.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.zeugnio_delete_employee('00000000-0000-0000-0000-0000000000e1');
do $$
begin
  begin
    perform public.zeugnio_delete_company('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FEHLER: HR-Leitung darf keine Firma löschen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare r public.certificate_register;
begin
  if exists (select 1 from public.employees where id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'FEHLER: e1 nicht gelöscht';
  end if;
  select * into r from public.certificate_register where certificate_id = '00000000-0000-0000-0000-0000000000f1';
  if not found then raise exception 'FEHLER: f1 fehlt im Register'; end if;
  if r.hash <> repeat('1', 64) or r.hash_version <> 2 or r.status <> 'final' then
    raise exception 'FEHLER: Siegelangaben im Register falsch: %', row_to_json(r);
  end if;
  -- Referenzwert aus hashBodyV1() in TypeScript für denselben Text.
  if r.body_hash <> 'fb058b3ad6fd86fcfe86539fc5ad14bd19d31317c3b0fd870842d4511274d643' then
    raise exception 'FEHLER: body_hash weicht von hashBodyV1 ab: %', r.body_hash;
  end if;
  if r.employer <> 'Löschtest Eins AG (Siegel)' or r.document_title <> 'Arbeitszeugnis' then
    raise exception 'FEHLER: v2 muss Arbeitgeber und Titel aus dem Siegel nehmen: %', row_to_json(r);
  end if;
  if r.verified_domain is distinct from 'loeschtest.ch' or r.signature <> 'c2lnbmF0dXI=' then
    raise exception 'FEHLER: Domain oder Signatur fehlt im Register';
  end if;
  if r.delete_after <> '2036-01-15T10:00:00Z'::timestamptz then
    raise exception 'FEHLER: Frist muss 10 Jahre ab Ausstellung sein: %', r.delete_after;
  end if;
  if (select count(*) from public.deletion_log where scope = 'employee' and certificates_registered = 1
        and actor_user_id = '00000000-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'FEHLER: Löschprotokoll für die Person fehlt';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Admin löscht Firma 1 -> f3 (v1, widerrufen) ins Register, Firma 2 bleibt.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.zeugnio_delete_company('00000000-0000-0000-0000-0000000000c1');
reset role;

do $$
declare r public.certificate_register;
begin
  if exists (select 1 from public.companies where id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FEHLER: Firma 1 nicht gelöscht';
  end if;
  if exists (select 1 from public.company_members where company_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FEHLER: Firmenzugänge nicht mitgelöscht';
  end if;
  if not exists (select 1 from public.companies where id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FEHLER: Firma 2 darf nicht betroffen sein';
  end if;
  select * into r from public.certificate_register where certificate_id = '00000000-0000-0000-0000-0000000000f3';
  if not found then raise exception 'FEHLER: f3 fehlt im Register'; end if;
  if r.status <> 'revoked' or r.revoked_at <> '2026-03-01T10:00:00Z'::timestamptz then
    raise exception 'FEHLER: Widerruf nicht im Register';
  end if;
  if r.employer <> 'Löschtest Eins AG' or r.document_title <> 'Zwischenzeugnis' or r.body_hash is not null then
    raise exception 'FEHLER: v1 braucht Firmenname und Titel aus dem Typ: %', row_to_json(r);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Konto: letzte Admin-Person wird abgewiesen; nach der Übergabe geht es.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
begin
  begin
    perform public.zeugnio_delete_account('00000000-0000-0000-0000-00000000000a');
    raise exception 'FEHLER: letzte Admin-Person darf ihr Konto nicht löschen';
  exception when check_violation then null;
  end;
end $$;
reset role;

update public.organization_members set role = 'admin'
where user_id = '00000000-0000-0000-0000-0000000000b1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select public.zeugnio_delete_account('00000000-0000-0000-0000-00000000000a');
reset role;

do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FEHLER: Profil von A nicht gelöscht';
  end if;
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FEHLER: auth.users von A nicht gelöscht';
  end if;
  if (select created_by_user_id from public.companies where id = '00000000-0000-0000-0000-0000000000c2') is not null then
    raise exception 'FEHLER: Ersteller der Firma muss leer sein';
  end if;
  if (select created_by_user_id from public.certificates where id = '00000000-0000-0000-0000-0000000000f5') is not null then
    raise exception 'FEHLER: Ersteller des finalen Zeugnisses muss leer sein';
  end if;
  if (select status from public.certificates where id = '00000000-0000-0000-0000-0000000000f5') <> 'final' then
    raise exception 'FEHLER: Zeugnis f5 muss unverändert final bleiben';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Neue Admin-Person (HL) löscht die ganze Organisation.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.zeugnio_delete_organization(
  (select organization_id from public.companies where id = '00000000-0000-0000-0000-0000000000c2'));
reset role;

do $$
begin
  if exists (select 1 from public.companies where id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FEHLER: Firma 2 nicht gelöscht';
  end if;
  if exists (select 1 from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FEHLER: Mitgliedschaften nicht gelöscht';
  end if;
  if not exists (select 1 from public.certificate_register where certificate_id = '00000000-0000-0000-0000-0000000000f5') then
    raise exception 'FEHLER: f5 fehlt im Register';
  end if;
  if (select count(*) from public.certificate_register
      where certificate_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f5')) <> 3 then
    raise exception 'FEHLER: Register muss drei Einträge haben';
  end if;
  if (select count(*) from public.deletion_log
      where scope in ('employee', 'company', 'organization', 'account')) < 4 then
    raise exception 'FEHLER: Löschprotokoll unvollständig';
  end if;
end $$;

select 'ALLE LÖSCHTESTS BESTANDEN' as ergebnis;
rollback;
