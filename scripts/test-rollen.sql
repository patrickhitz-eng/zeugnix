-- ============================================================================
-- Test der Rollen und Zeilenregeln aus 033_organisationen_rollen.sql
-- ============================================================================
-- Läuft gegen eine WEGWERF-Datenbank mit allen Migrationen (lokal oder die
-- Testinstanz), nie gegen die Produktion. Alles steckt in einer Transaktion,
-- die am Ende zurückgerollt wird; trotzdem: nur auf Testdaten.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-rollen.sql
--
-- Bricht beim ersten Fehler ab und nennt die verletzte Regel. Am Ende steht
-- «ALLE ROLLENTESTS BESTANDEN».
--
-- Wer handelt, bestimmt request.jwt.claims (sub = Profil-ID), genau wie bei
-- PostgREST. `set local role authenticated` macht die Zeilenregeln wirksam.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- Personen: A Admin · HL HR-Leitung · H HR · L Lesen · D deaktiviert · X fremd
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b1', 'leitung@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b2', 'hr@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b3', 'lesen@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000b4', 'weg@test.zeugnio.ch'),
  ('00000000-0000-0000-0000-0000000000ff', 'fremd@test.zeugnio.ch');
-- Ohne Trigger (Supabase) die Profile direkt anlegen.
insert into public.profiles (id, email)
select id, email from auth.users where email like '%@test.zeugnio.ch'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A legt zwei Firmen an: die erste erzeugt die Organisation, A wird Admin.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Testfirma Eins AG', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000c2', 'Testfirma Zwei AG', '00000000-0000-0000-0000-00000000000a');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Erika', 'Muster', 'Sachbearbeiterin', '2020-01-01');
insert into public.certificates (id, company_id, employee_id, type, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'schluss', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'schluss', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(distinct organization_id) from public.companies) <> 1 then
    raise exception 'FEHLER: beide Firmen von A müssen in derselben Organisation liegen';
  end if;
  if public.zeugnio_company_role('00000000-0000-0000-0000-0000000000c1') <> 'admin' then
    raise exception 'FEHLER: A ist nicht Admin';
  end if;
end $$;
reset role;

-- Mitglieder eintragen, wie es die Einladung (service_role) tut.
insert into public.organization_members (organization_id, user_id, role, deactivated_at)
select c.organization_id, u.id, 'mitglied', case when u.email like 'weg@%' then now() end
from public.companies c, auth.users u
where c.id = '00000000-0000-0000-0000-0000000000c1'
  and u.email in ('leitung@test.zeugnio.ch', 'hr@test.zeugnio.ch', 'lesen@test.zeugnio.ch', 'weg@test.zeugnio.ch');
insert into public.company_members (company_id, user_id, access_role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'hr_leitung'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'hr'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'lesen'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'hr');

-- ---------------------------------------------------------------------------
-- HR: sieht Firma 1, nicht Firma 2; bearbeitet, versiegelt nicht.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if (select count(*) from public.companies) <> 1 then raise exception 'FEHLER: HR muss genau Firma 1 sehen'; end if;
  if (select count(*) from public.certificates) <> 2 then raise exception 'FEHLER: HR muss alle Zeugnisse der Firma sehen'; end if;
  update public.certificates set edited_text = 'Entwurf HR' where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR darf ein Zeugnis bearbeiten'; end if;
  insert into public.employees (company_id, first_name, last_name, function_title, entry_date)
  values ('00000000-0000-0000-0000-0000000000c1', 'Hans', 'Test', 'Koch', '2021-01-01');
  begin
    update public.certificates set status = 'final' where id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FEHLER: HR darf nicht versiegeln';
  exception when insufficient_privilege then null;
  end;
  update public.companies set name = 'Gekapert' where id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: HR darf Firmendaten nicht ändern'; end if;
  begin
    insert into public.companies (name, created_by_user_id) values ('Eigene Firma', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'FEHLER: HR darf keine Firma anlegen';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.organization_members) <> 1 then raise exception 'FEHLER: HR sieht nur die eigene Mitgliedschaft'; end if;
  update public.organization_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: HR darf sich nicht selbst zum Admin machen'; end if;
  begin
    insert into public.company_members (company_id, user_id, access_role)
    values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'hr_leitung');
    raise exception 'FEHLER: HR darf sich keinen Firmenzugang geben';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Lesen: sieht, ändert nichts.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if (select count(*) from public.certificates) <> 2 then raise exception 'FEHLER: Lesen muss die Zeugnisse sehen'; end if;
  update public.certificates set edited_text = 'Lesen schreibt' where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Lesen darf nichts ändern'; end if;
  begin
    insert into public.employees (company_id, first_name, last_name, function_title, entry_date)
    values ('00000000-0000-0000-0000-0000000000c1', 'Lea', 'Lesen', 'Test', '2021-01-01');
    raise exception 'FEHLER: Lesen darf keine Mitarbeitenden anlegen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- HR-Leitung: versiegelt und widerruft.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update public.certificates
  set status = 'final', hash = 'testhash', canonical_content = 'x', finalized_at = now()
  where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR-Leitung muss versiegeln dürfen'; end if;
  update public.certificates set status = 'revoked', revoked_at = now()
  where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR-Leitung muss widerrufen dürfen'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Deaktiviert und Fremd: sehen nichts.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.companies) <> 0 or (select count(*) from public.certificates) <> 0 then
    raise exception 'FEHLER: Deaktivierte Person sieht noch Daten';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.companies) <> 0
     or (select count(*) from public.certificates) <> 0
     or (select count(*) from public.employees) <> 0
     or (select count(*) from public.organizations) <> 0 then
    raise exception 'FEHLER: Fremde Person sieht Daten';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin: sieht alle Mitglieder, verwaltet, kann sich nicht als letzte Admin-
-- Person entfernen, verschiebt keine Firma.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; org uuid;
begin
  select organization_id into org from public.companies where id = '00000000-0000-0000-0000-0000000000c1';
  if (select count(*) from public.organization_members) <> 5 then raise exception 'FEHLER: Admin sieht nicht alle Mitglieder'; end if;
  if (select count(*) from public.company_members) <> 4 then raise exception 'FEHLER: Admin sieht nicht alle Firmenzugänge'; end if;
  insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, expires_at)
  values (org, 'neu@test.zeugnio.ch', 'mitglied', 'hr', array['00000000-0000-0000-0000-0000000000c1'::uuid], 'testhash-1', now() + interval '7 days');
  update public.company_members set access_role = 'lesen' where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: Admin darf Rollen ändern'; end if;
  begin
    update public.organization_members set deactivated_at = now() where user_id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FEHLER: letzte Admin-Person darf sich nicht deaktivieren';
  exception when check_violation then null;
  end;
  begin
    delete from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FEHLER: letzte Admin-Person darf sich nicht entfernen';
  exception when check_violation then null;
  end;
  -- Mit einer zweiten Admin-Person geht es.
  update public.organization_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b1';
  update public.organization_members set deactivated_at = now() where user_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: mit zweiter Admin-Person muss Deaktivieren gehen'; end if;
end $$;
reset role;

-- A ist jetzt deaktiviert: kein Zugriff mehr, auch nicht auf selbst angelegte Firmen.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.companies) <> 0 then
    raise exception 'FEHLER: deaktivierte Erstellerin sieht ihre Firma noch';
  end if;
end $$;
reset role;

-- Eine fremde Person (ohne Organisation) legt eine Firma an: eigene Organisation.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (name, created_by_user_id) values ('Fremd GmbH', '00000000-0000-0000-0000-0000000000ff');
do $$ begin
  if (select count(*) from public.companies) <> 1 then raise exception 'FEHLER: neue Firma nicht sichtbar'; end if;
  if (select count(*) from public.organizations) <> 1 then raise exception 'FEHLER: neue Organisation fehlt'; end if;
  begin
    update public.companies set organization_id = (select organization_id from public.companies where id = '00000000-0000-0000-0000-0000000000c1');
    raise exception 'FEHLER: Organisation einer Firma darf sich nicht ändern';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'ALLE ROLLENTESTS BESTANDEN'
rollback;
