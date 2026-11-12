-- ============================================================================
-- 033_organisationen_rollen.sql  (Marktstart Schritt 23: Konten, Rollen, Organisation)
-- ============================================================================
-- PROBLEM: Bisher gab es nur «gehört zur Firma» oder nicht. Zugriff hatte, wer
--   die Firma angelegt hat (companies.created_by_user_id) oder in
--   company_members steht – und dort trug nie jemand etwas ein. Firmengruppen
--   und Behörden arbeiten aber zu mehreren, und nicht alle sollen versiegeln.
--
-- LÖSUNG:
--   organizations          der Kunde (Gruppe, Treuhand, KMU). Jede Firma gehört
--                          genau einer Organisation.
--   organization_members   wer zur Organisation gehört: 'admin' oder 'mitglied'.
--                          Austritt = deactivated_at setzen, nicht löschen.
--   company_members        (gibt es seit 001) bekommt access_role:
--                          'hr_leitung' | 'hr' | 'lesen' pro Firma.
--   organization_invitations  Einladung per Mail; gespeichert wird nur der
--                          SHA-256 des Tokens, nie der Token selbst.
--
-- RECHTE (entschieden 12.11.2026):
--                                     admin  hr_leitung  hr   lesen
--   Benutzer einladen, Rollen          x
--   Firmendaten, Mastervorlage         x
--   Zeugnis erstellen, bearbeiten      x      x           x
--   Vorgesetzte einladen               x      x           x
--   Finalisieren, versiegeln           x      x
--   Widerrufen                         x      x
--   Ansehen, PDF, Word                 x      x           x    x
--   Admins sehen alle Firmen ihrer Organisation; HR sieht alle Zeugnisse der
--   Firmen, für die sie freigeschaltet ist.
--
-- EINE QUELLE: Die Rolle berechnet allein public.zeugnio_company_role(). Die
--   Zeilenregeln unten rufen sie auf, und der Server fragt dieselbe Funktion
--   per RPC (lib/auth/ownership.ts). So können Code und Datenbank nicht
--   auseinanderlaufen. Die Hilfsfunktionen sind SECURITY DEFINER: sie lesen
--   die Mitgliedertabellen am RLS vorbei, sonst würden sich die Regeln von
--   company_members und organization_members gegenseitig aufrufen.
--
-- BESTAND: Je bisheriger Erstellerin bzw. bisherigem Ersteller entsteht eine
--   Organisation (Name = älteste eigene Firma) mit dieser Person als Admin.
--   Damit ändert sich für heutige Konten nichts. companies.created_by_user_id
--   bleibt stehen (Herkunft), gibt aber keinen Zugriff mehr: wer deaktiviert
--   wird, verliert ihn auch an selbst angelegten Firmen.
--
-- VERTRÄGLICH MIT DEM ALTEN CODE: Neue Firmen ohne organization_id bekommen sie
--   per Trigger. Der alte Code legt Firmen also weiter an, und Ersteller bleiben
--   Admin. Die Migration darf darum vor dem Deploy laufen.
--
-- Auth: Die Mitgliedschaft hängt an profiles.id, nicht an Supabase Auth. Sie
--   übersteht damit den Wechsel der Anmeldung (Cutover B) unverändert.
--
-- Idempotent. Supabase: SQL-Editor (Projekt «zeugnix»). advisori01: per
--   scripts/migrate.mjs, danach 901_nine_rechte.sql erneut ausführen (Rechte und
--   service_role-Regel für die drei neuen Tabellen).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabellen
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  -- Der Admin entscheidet: nur Adressen mit bestätigter Firmendomain einladen.
  invite_domain_only boolean not null default false,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'mitglied' check (role in ('admin', 'mitglied')),
  added_at timestamptz not null default now(),
  deactivated_at timestamptz,
  primary key (organization_id, user_id)
);
create index if not exists idx_org_members_user on public.organization_members(user_id);

alter table public.companies
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
create index if not exists idx_companies_org on public.companies(organization_id);

-- Rolle pro Firma. Bestehende Zeilen (falls es welche gibt) hatten bisher vollen
-- Zugriff inklusive Finalisieren, darum 'hr_leitung' als Bestandswert.
alter table public.company_members
  add column if not exists access_role text;
update public.company_members set access_role = 'hr_leitung' where access_role is null;
alter table public.company_members alter column access_role set default 'hr';
alter table public.company_members alter column access_role set not null;
do $$ begin
  alter table public.company_members
    add constraint company_members_access_role_check
    check (access_role in ('hr_leitung', 'hr', 'lesen'));
exception when duplicate_object then null; end $$;

create table if not exists public.organization_invitations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  org_role text not null default 'mitglied' check (org_role in ('admin', 'mitglied')),
  -- Für Mitglieder: Rolle und Firmen. Admins sehen ohnehin alle Firmen.
  company_role text check (company_role in ('hr_leitung', 'hr', 'lesen')),
  company_ids uuid[] not null default '{}',
  -- SHA-256 (hex) des Einladungs-Tokens. Der Token hat 256 Bit Zufall, ein
  -- Schlüssel (HMAC) brächte darum keinen Gewinn.
  token_hash text not null unique,
  invited_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  check (org_role = 'admin' or company_role is not null)
);
create unique index if not exists uq_org_invitation_open
  on public.organization_invitations(organization_id, email)
  where accepted_at is null and revoked_at is null;

-- ----------------------------------------------------------------------------
-- 2. Bestand: eine Organisation je bisheriger Erstellerin / bisherigem Ersteller
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  org uuid;
begin
  for r in
    select distinct created_by_user_id as uid
    from public.companies
    where organization_id is null
  loop
    select om.organization_id into org
    from public.organization_members om
    where om.user_id = r.uid and om.role = 'admin'
    order by om.added_at
    limit 1;

    if org is null then
      insert into public.organizations (name, created_by_user_id)
      select c.name, r.uid
      from public.companies c
      where c.created_by_user_id = r.uid
      order by c.created_at
      limit 1
      returning id into org;

      insert into public.organization_members (organization_id, user_id, role)
      values (org, r.uid, 'admin')
      on conflict do nothing;
    end if;

    update public.companies
    set organization_id = org
    where created_by_user_id = r.uid and organization_id is null;
  end loop;
end $$;

-- Wer schon in company_members steht, wird Mitglied der Organisation der Firma.
insert into public.organization_members (organization_id, user_id, role)
select distinct c.organization_id, cm.user_id, 'mitglied'
from public.company_members cm
join public.companies c on c.id = cm.company_id
on conflict do nothing;

alter table public.companies alter column organization_id set not null;

-- ----------------------------------------------------------------------------
-- 3. Rollen berechnen (einzige Quelle für Datenbank und Server)
-- ----------------------------------------------------------------------------
create or replace function public.zeugnio_is_org_admin(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
      and om.deactivated_at is null
  );
$$;

create or replace function public.zeugnio_is_org_member(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.deactivated_at is null
  );
$$;

-- 'admin' | 'hr_leitung' | 'hr' | 'lesen' | null (kein Zugriff)
create or replace function public.zeugnio_company_role(p_company_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.companies c
      join public.organization_members om on om.organization_id = c.organization_id
      where c.id = p_company_id
        and om.user_id = auth.uid()
        and om.role = 'admin'
        and om.deactivated_at is null
    ) then 'admin'
    else (
      select cm.access_role
      from public.company_members cm
      join public.companies c on c.id = cm.company_id
      join public.organization_members om
        on om.organization_id = c.organization_id and om.user_id = cm.user_id
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and om.deactivated_at is null
    )
  end;
$$;

create or replace function public.zeugnio_can_read(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.zeugnio_company_role(p_company_id) is not null; $$;

create or replace function public.zeugnio_can_edit(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.zeugnio_company_role(p_company_id) in ('admin', 'hr_leitung', 'hr'), false); $$;

create or replace function public.zeugnio_can_seal(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.zeugnio_company_role(p_company_id) in ('admin', 'hr_leitung'), false); $$;

create or replace function public.zeugnio_certificate_company(p_certificate_id uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$ select company_id from public.certificates where id = p_certificate_id; $$;

grant execute on function public.zeugnio_is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_is_org_member(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_company_role(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_read(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_edit(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_can_seal(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_certificate_company(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Trigger
-- ----------------------------------------------------------------------------

-- 4a. Neue Firma: Organisation zuordnen. auth.uid() ist null bei service_role
--     und bei Migrationen; dann gilt die Erstellerin als handelnde Person.
create or replace function public.zeugnio_company_assign_org()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  actor uuid := coalesce(auth.uid(), new.created_by_user_id);
  org uuid;
begin
  if new.organization_id is not null then
    if auth.uid() is not null and not public.zeugnio_is_org_admin(new.organization_id) then
      raise exception 'Nur Admins der Organisation dürfen dort Firmen anlegen.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select om.organization_id into org
  from public.organization_members om
  where om.user_id = actor and om.role = 'admin' and om.deactivated_at is null
  order by om.added_at
  limit 1;

  if org is null then
    -- Eingeladenes Mitglied ohne Admin-Recht: keine eigene Organisation nebenher.
    if exists (select 1 from public.organization_members om
               where om.user_id = actor and om.deactivated_at is null) then
      raise exception 'Firmen legt der Admin Ihrer Organisation an.'
        using errcode = '42501';
    end if;
    insert into public.organizations (name, created_by_user_id)
    values (new.name, actor)
    returning id into org;
    insert into public.organization_members (organization_id, user_id, role)
    values (org, actor, 'admin');
  end if;

  new.organization_id := org;
  return new;
end;
$$;

drop trigger if exists trg_company_assign_org on public.companies;
create trigger trg_company_assign_org
  before insert on public.companies
  for each row execute function public.zeugnio_company_assign_org();

-- 4b. Eine Firma wechselt die Organisation nicht über die App.
create or replace function public.zeugnio_company_org_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id and auth.uid() is not null then
    raise exception 'Die Organisation einer Firma lässt sich nicht ändern.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_org_immutable on public.companies;
create trigger trg_company_org_immutable
  before update of organization_id on public.companies
  for each row execute function public.zeugnio_company_org_immutable();

-- 4c. Versiegeln und Widerrufen nur mit Recht 'seal'. Als Trigger statt als
--     Zeilenregel, weil HR finalisierte Zeugnisse weiter lesen und z. B.
--     archivieren darf; gesperrt ist nur der Wechsel in 'final' oder 'revoked'.
create or replace function public.zeugnio_certificate_seal_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status in ('final', 'revoked')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not public.zeugnio_can_seal(new.company_id) then
    raise exception 'Versiegeln und Widerrufen darf nur HR-Leitung oder Admin.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_certificate_seal_guard on public.certificates;
create trigger trg_certificate_seal_guard
  before insert or update of status on public.certificates
  for each row execute function public.zeugnio_certificate_seal_guard();

-- 4d. Jede Organisation behält mindestens eine aktive Admin-Person.
create or replace function public.zeugnio_keep_last_admin()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.role <> 'admin' or old.deactivated_at is not null then
    return null;
  end if;
  -- Organisation wird gerade gelöscht (Kaskade): nichts zu schützen.
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return null;
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = old.organization_id
      and om.role = 'admin'
      and om.deactivated_at is null
  ) then
    raise exception 'Die letzte Admin-Person der Organisation lässt sich nicht entfernen.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_keep_last_admin on public.organization_members;
create trigger trg_keep_last_admin
  after update or delete on public.organization_members
  for each row execute function public.zeugnio_keep_last_admin();

-- ----------------------------------------------------------------------------
-- 5. Zeilenregeln (RLS)
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

-- organizations
drop policy if exists "Members view organization" on public.organizations;
create policy "Members view organization" on public.organizations
  for select using (public.zeugnio_is_org_member(id));
drop policy if exists "Admins update organization" on public.organizations;
create policy "Admins update organization" on public.organizations
  for update using (public.zeugnio_is_org_admin(id))
  with check (public.zeugnio_is_org_admin(id));

-- organization_members: eigene Zeile oder Admin der Organisation. Neue
-- Mitglieder entstehen nur über die Einladung (Server, service_role).
drop policy if exists "View organization members" on public.organization_members;
create policy "View organization members" on public.organization_members
  for select using (user_id = auth.uid() or public.zeugnio_is_org_admin(organization_id));
drop policy if exists "Admins update organization members" on public.organization_members;
create policy "Admins update organization members" on public.organization_members
  for update using (public.zeugnio_is_org_admin(organization_id))
  with check (public.zeugnio_is_org_admin(organization_id));
drop policy if exists "Admins delete organization members" on public.organization_members;
create policy "Admins delete organization members" on public.organization_members
  for delete using (public.zeugnio_is_org_admin(organization_id));

-- organization_invitations: nur Admins
drop policy if exists "Admins manage invitations" on public.organization_invitations;
create policy "Admins manage invitations" on public.organization_invitations
  for all using (public.zeugnio_is_org_admin(organization_id))
  with check (public.zeugnio_is_org_admin(organization_id));

-- companies
drop policy if exists "Members can view companies" on public.companies;
create policy "Members can view companies" on public.companies
  for select using (public.zeugnio_can_read(id));
drop policy if exists "Authenticated users can create companies" on public.companies;
create policy "Authenticated users can create companies" on public.companies
  for insert with check (auth.uid() = created_by_user_id);
drop policy if exists "Owners can update companies" on public.companies;
create policy "Owners can update companies" on public.companies
  for update using (public.zeugnio_company_role(id) = 'admin')
  with check (public.zeugnio_company_role(id) = 'admin');

-- company_members: eigene Zeile oder Admin der Organisation der Firma
drop policy if exists "Members see own membership" on public.company_members;
create policy "Members see own membership" on public.company_members
  for select using (user_id = auth.uid() or public.zeugnio_company_role(company_id) = 'admin');
drop policy if exists "Admins manage company access" on public.company_members;
create policy "Admins manage company access" on public.company_members
  for all using (public.zeugnio_company_role(company_id) = 'admin')
  with check (public.zeugnio_company_role(company_id) = 'admin');

-- employees
drop policy if exists "Members can manage employees" on public.employees;
drop policy if exists "Read employees" on public.employees;
create policy "Read employees" on public.employees
  for select using (public.zeugnio_can_read(company_id));
drop policy if exists "Edit employees" on public.employees;
create policy "Edit employees" on public.employees
  for all using (public.zeugnio_can_edit(company_id))
  with check (public.zeugnio_can_edit(company_id));

-- certificates (Versiegeln zusätzlich über Trigger 4c)
drop policy if exists "Members can manage certificates" on public.certificates;
drop policy if exists "Read certificates" on public.certificates;
create policy "Read certificates" on public.certificates
  for select using (public.zeugnio_can_read(company_id));
drop policy if exists "Edit certificates" on public.certificates;
create policy "Edit certificates" on public.certificates
  for all using (public.zeugnio_can_edit(company_id))
  with check (public.zeugnio_can_edit(company_id));

-- manager_invitations
drop policy if exists "Members can manage invitations" on public.manager_invitations;
drop policy if exists "Members can insert invitations" on public.manager_invitations;
drop policy if exists "Members can update invitations" on public.manager_invitations;
drop policy if exists "Read manager invitations" on public.manager_invitations;
create policy "Read manager invitations" on public.manager_invitations
  for select using (public.zeugnio_can_read(public.zeugnio_certificate_company(certificate_id)));
drop policy if exists "Edit manager invitations" on public.manager_invitations;
create policy "Edit manager invitations" on public.manager_invitations
  for all using (public.zeugnio_can_edit(public.zeugnio_certificate_company(certificate_id)))
  with check (public.zeugnio_can_edit(public.zeugnio_certificate_company(certificate_id)));

-- evaluations (Schreiben der vorgesetzten Person läuft über service_role)
drop policy if exists "Members can read evaluations" on public.evaluations;
create policy "Members can read evaluations" on public.evaluations
  for select using (public.zeugnio_can_read(public.zeugnio_certificate_company(certificate_id)));
drop policy if exists "Members can insert evaluations" on public.evaluations;
create policy "Members can insert evaluations" on public.evaluations
  for insert with check (public.zeugnio_can_edit(public.zeugnio_certificate_company(certificate_id)));
drop policy if exists "Members can delete evaluations" on public.evaluations;
create policy "Members can delete evaluations" on public.evaluations
  for delete using (public.zeugnio_can_edit(public.zeugnio_certificate_company(certificate_id)));

-- Nur lesend
drop policy if exists "Members can view company domains" on public.company_domains;
create policy "Members can view company domains" on public.company_domains
  for select using (public.zeugnio_can_read(company_id));

drop policy if exists "Members can view certificate signoffs" on public.certificate_signoffs;
create policy "Members can view certificate signoffs" on public.certificate_signoffs
  for select using (public.zeugnio_can_read(public.zeugnio_certificate_company(certificate_id)));

drop policy if exists "Members can read audit log" on public.audit_log;
create policy "Members can read audit log" on public.audit_log
  for select using (public.zeugnio_can_read(public.zeugnio_certificate_company(certificate_id)));

drop policy if exists "Members can view badges" on public.employer_badges;
create policy "Members can view badges" on public.employer_badges
  for select using (public.zeugnio_can_read(company_id));

-- Done.
