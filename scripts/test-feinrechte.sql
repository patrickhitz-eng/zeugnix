-- ============================================================================
-- Test der Feinrechte aus 035_feinrechte.sql
-- ============================================================================
-- Läuft wie scripts/test-rollen.sql gegen eine WEGWERF-Datenbank mit allen
-- Migrationen, nie gegen die Produktion. Alles in einer Transaktion, die am
-- Ende zurückgerollt wird.
--
--   psql -X -v ON_ERROR_STOP=1 -d <testdb> -f scripts/test-feinrechte.sql
--
-- Schwerpunkt: Niemand bekommt über die Feinrechte mehr, als die Admin-Person
-- vergeben hat. Wer «Team verwalten» hat, kann sich und andere nicht
-- befördern und keine Konten von ausserhalb der Organisation aufnehmen.
-- Am Ende steht «ALLE FEINRECHTE-TESTS BESTANDEN».
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- Personen: A Admin · L HR-Leitung · H HR · R Lesen · M HR mit «Team» in
-- Firma 1 · N Mitglied ohne Firma · X fremd (eigene Organisation)
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-00000000000a', 'admin@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000b1', 'leitung@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000b2', 'hr@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000b3', 'lesen@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000b5', 'team@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000b6', 'neu@fein.test.zeugnio.ch'),
  ('10000000-0000-0000-0000-0000000000ff', 'fremd@fein.test.zeugnio.ch');
insert into public.profiles (id, email)
select id, email from auth.users where email like '%@fein.test.zeugnio.ch'
on conflict (id) do nothing;

-- A legt zwei Firmen an (eine Organisation), X eine eigene.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('10000000-0000-0000-0000-0000000000c1', 'Fein Eins AG', '10000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000c2', 'Fein Zwei AG', '10000000-0000-0000-0000-00000000000a');
insert into public.employees (id, company_id, first_name, last_name, function_title, entry_date) values
  ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000c1', 'Erika', 'Muster', 'Sachbearbeiterin', '2020-01-01');
insert into public.certificates (id, company_id, employee_id, type, created_by_user_id) values
  ('10000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000e1', 'schluss', '10000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000e1', 'schluss', '10000000-0000-0000-0000-00000000000a');
reset role;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
insert into public.companies (id, name, created_by_user_id) values
  ('10000000-0000-0000-0000-0000000000c9', 'Fremd AG', '10000000-0000-0000-0000-0000000000ff');
reset role;

-- Mitglieder wie nach einer Einladung (service_role).
insert into public.organization_members (organization_id, user_id, role)
select c.organization_id, u.id, 'mitglied'
from public.companies c, auth.users u
where c.id = '10000000-0000-0000-0000-0000000000c1'
  and u.email in ('leitung@fein.test.zeugnio.ch', 'hr@fein.test.zeugnio.ch', 'lesen@fein.test.zeugnio.ch',
                  'team@fein.test.zeugnio.ch', 'neu@fein.test.zeugnio.ch');
insert into public.company_members (company_id, user_id, access_role) values
  ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', 'hr_leitung'),
  ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b2', 'hr'),
  ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b3', 'lesen'),
  ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b5', 'hr'),
  ('10000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000b5', 'hr');

-- ---------------------------------------------------------------------------
-- 1. Ohne Feinrechte: genau wie 033.
-- ---------------------------------------------------------------------------
do $$
declare c1 uuid := '10000000-0000-0000-0000-0000000000c1';
begin
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-00000000000a') <> array['read','edit','seal','team','company','admin'] then
    raise exception 'FEHLER: Admin hat nicht alle Rechte'; end if;
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-0000000000b1') <> array['read','edit','seal'] then
    raise exception 'FEHLER: HR-Leitung ohne Feinrechte falsch'; end if;
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-0000000000b2') <> array['read','edit'] then
    raise exception 'FEHLER: HR ohne Feinrechte falsch'; end if;
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-0000000000b3') <> array['read'] then
    raise exception 'FEHLER: Lesen ohne Feinrechte falsch'; end if;
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-0000000000ff') <> '{}'::text[] then
    raise exception 'FEHLER: Fremde Person hat Rechte'; end if;
  if public.zeugnio_permissions_for(c1, '10000000-0000-0000-0000-0000000000b6') <> '{}'::text[] then
    raise exception 'FEHLER: Mitglied ohne Firmenzugang hat Rechte'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Die Admin-Person setzt Feinrechte (mit ihrer Sitzung).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update public.company_members set seal_override = true, may_edit_company = true
  where company_id = '10000000-0000-0000-0000-0000000000c1' and user_id = '10000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: Admin muss Feinrechte setzen können'; end if;
  update public.company_members set seal_override = false
  where company_id = '10000000-0000-0000-0000-0000000000c1' and user_id = '10000000-0000-0000-0000-0000000000b1';
  update public.company_members set may_manage_team = true
  where company_id = '10000000-0000-0000-0000-0000000000c1' and user_id = '10000000-0000-0000-0000-0000000000b5';
  begin
    update public.company_members set seal_override = true
    where company_id = '10000000-0000-0000-0000-0000000000c1' and user_id = '10000000-0000-0000-0000-0000000000b3';
    raise exception 'FEHLER: Lesen darf keine Versiegel-Abweichung bekommen';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Versiegeln: HR mit Abweichung ja, HR-Leitung ohne nein.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    update public.certificates set status = 'final', hash = 'h1', canonical_content = 'x', finalized_at = now()
    where id = '10000000-0000-0000-0000-0000000000f1';
    raise exception 'FEHLER: HR-Leitung ohne Versiegeln darf nicht versiegeln';
  exception when insufficient_privilege then null;
  end;
  update public.certificates set edited_text = 'Leitung bearbeitet weiter' where id = '10000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR-Leitung ohne Versiegeln darf weiter bearbeiten'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update public.certificates set status = 'final', hash = 'h2', canonical_content = 'x', finalized_at = now()
  where id = '10000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR mit Versiegel-Recht muss versiegeln dürfen'; end if;
  if not ('seal' = any(public.zeugnio_permissions('10000000-0000-0000-0000-0000000000c1'))) then
    raise exception 'FEHLER: zeugnio_permissions zeigt das Versiegel-Recht nicht'; end if;

  -- 4. Firmendaten: erlaubte Felder ja, alles andere nein, andere Firma nein.
  update public.companies set name = 'Fein Eins AG neu', certificate_footer = 'Fusszeile'
  where id = '10000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: HR mit Firmendaten-Recht muss Stammdaten ändern dürfen'; end if;
  begin
    update public.companies set has_employer_badge = true where id = '10000000-0000-0000-0000-0000000000c1';
    raise exception 'FEHLER: Spalten-Schutz greift nicht (has_employer_badge)';
  exception when insufficient_privilege then null;
  end;
  update public.companies set name = 'Gekapert' where id = '10000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Firmendaten-Recht gilt nur für die eigene Firma'; end if;

  -- zeugnio_permissions_for ist nur für den Server.
  begin
    perform public.zeugnio_permissions_for('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-00000000000a');
    raise exception 'FEHLER: zeugnio_permissions_for darf nicht für authenticated offen sein';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Team verwalten (M in Firma 1): innerhalb der Grenzen ja, sonst nein.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
  c1 uuid := '10000000-0000-0000-0000-0000000000c1';
  c2 uuid := '10000000-0000-0000-0000-0000000000c2';
begin
  if (select count(*) from public.company_members where company_id = c1) <> 4 then
    raise exception 'FEHLER: Team-Verwaltung muss die Zugänge ihrer Firma sehen'; end if;

  -- Mitglied ohne Firma aufnehmen, als Lesen: ja.
  insert into public.company_members (company_id, user_id, access_role)
  values (c1, '10000000-0000-0000-0000-0000000000b6', 'lesen');
  -- Fremdes Konto: nein.
  begin
    insert into public.company_members (company_id, user_id, access_role)
    values (c1, '10000000-0000-0000-0000-0000000000ff', 'lesen');
    raise exception 'FEHLER: Team-Verwaltung darf keine fremden Konten aufnehmen';
  exception when insufficient_privilege then null;
  end;
  -- HR-Leitung vergeben: nein.
  begin
    update public.company_members set access_role = 'hr_leitung'
    where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b6';
    raise exception 'FEHLER: Team-Verwaltung darf keine HR-Leitung vergeben';
  exception when insufficient_privilege then null;
  end;
  -- Feinrechte vergeben: nein.
  begin
    update public.company_members set may_manage_team = true
    where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b6';
    raise exception 'FEHLER: Team-Verwaltung darf keine Feinrechte vergeben';
  exception when insufficient_privilege then null;
  end;
  -- Firma ohne Team-Recht: nein.
  begin
    insert into public.company_members (company_id, user_id, access_role)
    values (c2, '10000000-0000-0000-0000-0000000000b6', 'lesen');
    raise exception 'FEHLER: Team-Recht gilt nur für die eigene Firma';
  exception when insufficient_privilege then null;
  end;
  -- Lesen → HR: ja.
  update public.company_members set access_role = 'hr'
  where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: Team-Verwaltung muss Lesen auf HR setzen dürfen'; end if;
  -- HR-Leitung zurückstufen oder entfernen: nein (Zeile unsichtbar für die Änderung).
  update public.company_members set access_role = 'lesen'
  where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Verwaltung darf HR-Leitung nicht ändern'; end if;
  delete from public.company_members where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Verwaltung darf HR-Leitung nicht entfernen'; end if;
  -- Person mit Feinrechten (H): nein.
  delete from public.company_members where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Verwaltung darf Personen mit Feinrechten nicht entfernen'; end if;
  -- Eigene Zeile: nein.
  update public.company_members set seal_override = true where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Verwaltung darf sich nicht selbst befördern'; end if;
  -- Organisation: nein.
  update public.organization_members set deactivated_at = now() where user_id = '10000000-0000-0000-0000-0000000000b3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Verwaltung darf niemanden deaktivieren'; end if;
  -- Entziehen: ja.
  delete from public.company_members where company_id = c1 and user_id = '10000000-0000-0000-0000-0000000000b6';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FEHLER: Team-Verwaltung muss Zugang entziehen dürfen'; end if;

  -- Einladungen: HR in Firma 1 ja; HR-Leitung, Admin, Firma 2, fremder Absender nein.
  insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, invited_by_user_id, expires_at)
  select organization_id, 'neu1@fein.test.zeugnio.ch', 'mitglied', 'hr', array[c1], md5('t1'), '10000000-0000-0000-0000-0000000000b5', now() + interval '14 days'
  from public.companies where id = c1;
  begin
    insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, invited_by_user_id, expires_at)
    select organization_id, 'neu2@fein.test.zeugnio.ch', 'mitglied', 'hr_leitung', array[c1], md5('t2'), '10000000-0000-0000-0000-0000000000b5', now() + interval '14 days'
    from public.companies where id = c1;
    raise exception 'FEHLER: Einladung als HR-Leitung durch Team-Verwaltung';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, invited_by_user_id, expires_at)
    select organization_id, 'neu3@fein.test.zeugnio.ch', 'admin', null, '{}', md5('t3'), '10000000-0000-0000-0000-0000000000b5', now() + interval '14 days'
    from public.companies where id = c1;
    raise exception 'FEHLER: Einladung als Admin durch Team-Verwaltung';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, invited_by_user_id, expires_at)
    select organization_id, 'neu4@fein.test.zeugnio.ch', 'mitglied', 'hr', array[c1, c2], md5('t4'), '10000000-0000-0000-0000-0000000000b5', now() + interval '14 days'
    from public.companies where id = c1;
    raise exception 'FEHLER: Einladung in Firma ohne Team-Recht';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.organization_invitations (organization_id, email, org_role, company_role, company_ids, token_hash, invited_by_user_id, expires_at)
    select organization_id, 'neu5@fein.test.zeugnio.ch', 'mitglied', 'hr', array[c1], md5('t5'), '10000000-0000-0000-0000-00000000000a', now() + interval '14 days'
    from public.companies where id = c1;
    raise exception 'FEHLER: Einladung im Namen einer anderen Person';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.organization_invitations) <> 1 then
    raise exception 'FEHLER: Team-Verwaltung sieht nur die eigenen Einladungen'; end if;

  -- Firmendaten hat M nicht.
  update public.companies set name = 'Gekapert' where id = c1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FEHLER: Team-Recht gibt keine Firmendaten'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Deaktiviert: Feinrechte zählen nicht mehr.
-- ---------------------------------------------------------------------------
update public.organization_members set deactivated_at = now()
where user_id = '10000000-0000-0000-0000-0000000000b2';
do $$ begin
  if public.zeugnio_permissions_for('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b2') <> '{}'::text[] then
    raise exception 'FEHLER: Deaktivierte Person behält Feinrechte'; end if;
end $$;

\echo 'ALLE FEINRECHTE-TESTS BESTANDEN'
rollback;
