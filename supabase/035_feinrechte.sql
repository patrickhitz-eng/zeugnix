-- ============================================================================
-- 035_feinrechte.sql  (Rollen als Vorlage, dazu Feinrechte pro Person und Firma)
-- ============================================================================
-- PROBLEM: Die vier Rollen aus 033 (Admin, HR-Leitung, HR, Lesen) bündeln die
--   Rechte fest. Im Konzern soll eine HR-Leitung aber ihr Team selbst einladen
--   können, ohne Admin zu sein. Eine HR-Person soll ausnahmsweise versiegeln
--   dürfen, eine HR-Leitung ausnahmsweise nicht. Firmendaten und Mastervorlage
--   soll auch jemand pflegen können, der nicht Admin ist. Vorbild: RestStep,
--   das pro Person und Modul Rechte vergibt und «Benutzer verwalten» als
--   eigenen Schalter führt.
--
-- LÖSUNG: Die Rolle bleibt die Vorlage (Einladen bleibt ein Klick). Pro Person
--   und Firma kann die Admin-Person drei Rechte abweichend setzen:
--
--     seal_override     Versiegeln und widerrufen. null = wie die Rolle
--                       (HR-Leitung ja, HR nein), true = ja, false = nein.
--                       Nur für HR-Leitung und HR, denn wer nicht bearbeiten
--                       darf, kann auch nicht finalisieren.
--     may_manage_team   Team verwalten: in DIESE Firma einladen, dort Zugänge
--                       ändern und entziehen, aber höchstens HR oder Lesen
--                       vergeben und keine Feinrechte. Wer so einlädt, kann
--                       nie mehr verteilen, als er selbst hat.
--     may_edit_company  Firmendaten, Logo und Mastervorlage dieser Firma.
--                       Die Domain bestätigen bleibt Admin-Sache, weil davon
--                       «nur Firmendomain einladen» abhängt.
--
--   Admins der Organisation haben immer alle Rechte; für sie gibt es keine
--   Abweichung.
--
-- EINE QUELLE: public.zeugnio_permissions_for(firma, person) berechnet die
--   Rechte. Die bisherigen Funktionen zeugnio_can_read/edit/seal rufen sie
--   auf, ebenso die neuen zeugnio_can_manage_team und
--   zeugnio_can_edit_company. Die Zeilenregeln aus 033 bleiben damit gültig
--   und kennen die Feinrechte automatisch. Der Server fragt dieselbe Funktion
--   per RPC (lib/auth/ownership.ts). zeugnio_company_role() bleibt für die
--   Anzeige der Rolle.
--
-- SPALTEN-SCHUTZ: Wer nur «Firmendaten» darf, kann per Zeilenregel die Zeile
--   der Firma ändern. Ein Trigger lässt dann nur die Felder zu, die auch das
--   Formular schreibt (lib/company/payload.ts und das Logo). Kommt später eine
--   Spalte dazu, ist sie für Nicht-Admins gesperrt, bis sie hier freigegeben ist.
--
-- VERTRÄGLICH: Ohne gesetzte Feinrechte rechnet die Funktion genau wie 033.
--   Bestehende Konten merken nichts. Der alte Code läuft gegen die neue
--   Datenbank weiter; die Migration darf vor dem Deploy laufen.
--
-- Idempotent. Supabase: SQL-Editor (Projekt «zeugnix»). advisori01: per
--   scripts/migrate.mjs, danach 901_nine_rechte.sql erneut ausführen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Spalten
-- ----------------------------------------------------------------------------
alter table public.company_members
  add column if not exists seal_override boolean,
  add column if not exists may_manage_team boolean not null default false,
  add column if not exists may_edit_company boolean not null default false;

do $$ begin
  alter table public.company_members
    add constraint company_members_seal_override_check
    check (seal_override is null or access_role in ('hr_leitung', 'hr'));
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Rechte berechnen (einzige Quelle)
-- ----------------------------------------------------------------------------
-- Ergebnis: Teilmenge von {read, edit, seal, team, company, admin}.
create or replace function public.zeugnio_permissions_for(p_company_id uuid, p_user_id uuid)
returns text[]
language plpgsql stable security definer
set search_path = public
as $$
declare
  m record;
  perms text[];
begin
  if p_company_id is null or p_user_id is null then
    return '{}';
  end if;

  if exists (
    select 1
    from public.companies c
    join public.organization_members om on om.organization_id = c.organization_id
    where c.id = p_company_id
      and om.user_id = p_user_id
      and om.role = 'admin'
      and om.deactivated_at is null
  ) then
    return array['read', 'edit', 'seal', 'team', 'company', 'admin'];
  end if;

  select cm.access_role, cm.seal_override, cm.may_manage_team, cm.may_edit_company
  into m
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  join public.organization_members om
    on om.organization_id = c.organization_id and om.user_id = cm.user_id
  where cm.company_id = p_company_id
    and cm.user_id = p_user_id
    and om.deactivated_at is null;

  if not found then
    return '{}';
  end if;

  perms := array['read'];
  if m.access_role in ('hr_leitung', 'hr') then
    perms := perms || 'edit'::text;
    if coalesce(m.seal_override, m.access_role = 'hr_leitung') then
      perms := perms || 'seal'::text;
    end if;
  end if;
  if m.may_manage_team then
    perms := perms || 'team'::text;
  end if;
  if m.may_edit_company then
    perms := perms || 'company'::text;
  end if;
  return perms;
end;
$$;

-- Rechte der angemeldeten Person.
create or replace function public.zeugnio_permissions(p_company_id uuid)
returns text[]
language sql stable security definer
set search_path = public
as $$ select public.zeugnio_permissions_for(p_company_id, auth.uid()); $$;

create or replace function public.zeugnio_can_read(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select 'read' = any(public.zeugnio_permissions(p_company_id)); $$;

create or replace function public.zeugnio_can_edit(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select 'edit' = any(public.zeugnio_permissions(p_company_id)); $$;

create or replace function public.zeugnio_can_seal(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select 'seal' = any(public.zeugnio_permissions(p_company_id)); $$;

create or replace function public.zeugnio_can_manage_team(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select 'team' = any(public.zeugnio_permissions(p_company_id)); $$;

create or replace function public.zeugnio_can_edit_company(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select 'company' = any(public.zeugnio_permissions(p_company_id)); $$;

-- Darf die angemeldete Person in ALLE diese Firmen einladen? Leere Liste = nein.
create or replace function public.zeugnio_can_manage_team_all(p_company_ids uuid[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(cardinality(p_company_ids), 0) > 0
     and not exists (
       select 1 from unnest(p_company_ids) as x(id)
       where not public.zeugnio_can_manage_team(x.id)
     );
$$;

-- Gehört die Person aktiv zur Organisation der Firma? Für die Zeilenregel der
-- Teamverwaltung: sie darf nur Mitgliedern Zugang geben, nicht beliebigen Konten.
create or replace function public.zeugnio_user_in_company_org(p_company_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    join public.organization_members om on om.organization_id = c.organization_id
    where c.id = p_company_id
      and om.user_id = p_user_id
      and om.deactivated_at is null
  );
$$;
grant execute on function public.zeugnio_user_in_company_org(uuid, uuid) to authenticated, service_role;

-- zeugnio_permissions_for verrät die Rechte beliebiger Personen: nur für den
-- Server (service_role), z. B. um Mails an das richtige Team zu schicken.
revoke execute on function public.zeugnio_permissions_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zeugnio_permissions_for(uuid, uuid) to service_role;

grant execute on function public.zeugnio_permissions(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_read(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_edit(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_seal(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_manage_team(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_edit_company(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_manage_team_all(uuid[]) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Firmendaten: Zeilenregel und Spalten-Schutz
-- ----------------------------------------------------------------------------
drop policy if exists "Owners can update companies" on public.companies;
create policy "Owners can update companies" on public.companies
  for update using (public.zeugnio_can_edit_company(id))
  with check (public.zeugnio_can_edit_company(id));

create or replace function public.zeugnio_company_column_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Was das Formular (lib/company/payload.ts) und die Logo-Route schreiben.
  allowed text[] := array[
    'name', 'address', 'postal_code', 'city', 'website', 'phone', 'email',
    'signatory_1_name', 'signatory_1_role', 'signatory_2_name', 'signatory_2_role',
    'certificate_footer', 'company_description', 'logo_url',
    'default_certificate_font_family', 'brand_accent', 'show_verification_block',
    'default_optin_bedauern', 'default_zeugnis_typ', 'default_wertschaetzungsgrad',
    'updated_at'
  ];
begin
  if auth.uid() is null or public.zeugnio_is_org_admin(old.organization_id) then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Dieses Feld der Firma darf nur ein Admin der Organisation ändern.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_column_guard on public.companies;
create trigger trg_company_column_guard
  before update on public.companies
  for each row execute function public.zeugnio_company_column_guard();

-- ----------------------------------------------------------------------------
-- 4. Team verwalten: Zeilenregeln
-- ----------------------------------------------------------------------------
-- Eine Zeile, die jemand mit «Team verwalten» anfassen darf: Rolle HR oder
-- Lesen, keine Feinrechte, nicht die eigene. So kann niemand sich selbst
-- befördern, und von der Admin-Person gesetzte Feinrechte bleiben unangetastet.

-- company_members
drop policy if exists "Members see own membership" on public.company_members;
create policy "Members see own membership" on public.company_members
  for select using (
    user_id = auth.uid()
    or public.zeugnio_company_role(company_id) = 'admin'
    or public.zeugnio_can_manage_team(company_id)
  );

drop policy if exists "Team managers insert company access" on public.company_members;
create policy "Team managers insert company access" on public.company_members
  for insert with check (
    public.zeugnio_can_manage_team(company_id)
    and public.zeugnio_user_in_company_org(company_id, user_id)
    and user_id <> auth.uid()
    and access_role in ('hr', 'lesen')
    and seal_override is null and not may_manage_team and not may_edit_company
  );

drop policy if exists "Team managers update company access" on public.company_members;
create policy "Team managers update company access" on public.company_members
  for update using (
    public.zeugnio_can_manage_team(company_id)
    and user_id <> auth.uid()
    and access_role in ('hr', 'lesen')
    and seal_override is null and not may_manage_team and not may_edit_company
  )
  with check (
    public.zeugnio_can_manage_team(company_id)
    and user_id <> auth.uid()
    and access_role in ('hr', 'lesen')
    and seal_override is null and not may_manage_team and not may_edit_company
  );

drop policy if exists "Team managers delete company access" on public.company_members;
create policy "Team managers delete company access" on public.company_members
  for delete using (
    public.zeugnio_can_manage_team(company_id)
    and user_id <> auth.uid()
    and access_role in ('hr', 'lesen')
    and seal_override is null and not may_manage_team and not may_edit_company
  );

-- organization_invitations: eigene Einladungen in eigene Firmen, nur als
-- Mitglied mit HR oder Lesen.
drop policy if exists "Team managers create invitations" on public.organization_invitations;
create policy "Team managers create invitations" on public.organization_invitations
  for insert with check (
    invited_by_user_id = auth.uid()
    and org_role = 'mitglied'
    and company_role in ('hr', 'lesen')
    and public.zeugnio_can_manage_team_all(company_ids)
  );

drop policy if exists "Team managers see own invitations" on public.organization_invitations;
create policy "Team managers see own invitations" on public.organization_invitations
  for select using (
    invited_by_user_id = auth.uid()
    and public.zeugnio_can_manage_team_all(company_ids)
  );

drop policy if exists "Team managers revoke own invitations" on public.organization_invitations;
create policy "Team managers revoke own invitations" on public.organization_invitations
  for update using (
    invited_by_user_id = auth.uid()
    and public.zeugnio_can_manage_team_all(company_ids)
  )
  with check (
    invited_by_user_id = auth.uid()
    and org_role = 'mitglied'
    and company_role in ('hr', 'lesen')
    and public.zeugnio_can_manage_team_all(company_ids)
  );

-- Done.
