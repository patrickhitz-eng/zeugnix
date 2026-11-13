-- ============================================================================
-- 036_loeschen_register.sql
-- Löschen und Prüfregister (Schritt 17 im Marktstart-Fahrplan)
-- ============================================================================
-- Bisher liess sich weder ein Konto noch eine Firma noch eine einzelne Person
-- löschen. Entscheide vom 13.11.2026 (Silvan, E5):
--
--   * Prüfregister: Wird ein ausgestelltes (finales oder widerrufenes) Zeugnis
--     gelöscht, bleibt ein Eintrag OHNE Personendaten: Siegel-Hash, Hash nur
--     des Textes, Signatur, Status, Daten, Arbeitgeber, Titel, bestätigte
--     Domain. Damit meldet /verify weiter «echt», «widerrufen» oder «Kopf bzw.
--     Unterschriften verändert». Der Inhalt bleibt so prüfbar wie vorher: Die
--     Prüfung rechnet den Hash aus dem hochgeladenen PDF, gespeicherter Text
--     ist dafür nicht nötig. Frist: 10 Jahre ab Ausstellung (delete_after,
--     abgeräumt vom täglichen Cron /api/cron/pii-cleanup).
--   * Wer löscht: Die Admin-Person der Organisation löscht eine Firma oder die
--     ganze Organisation. Wer versiegeln darf (HR-Leitung, Admin), löscht
--     einzelne Mitarbeitende samt ihren Zeugnissen.
--   * Konto: Jede Person löscht ihr Konto selbst. Was sie angelegt hat, bleibt
--     bei der Firma (Ersteller-Feld wird leer). Die letzte Admin-Person muss
--     zuerst jemanden zum Admin machen oder die Organisation löschen.
--
-- Bausteine:
--   1. Tabelle certificate_register (nur service_role liest; RLS ohne Policy).
--   2. Löschsperre: Ein finales oder widerrufenes Zeugnis lässt sich nur noch
--      über die Löschfunktionen unten entfernen (oder als service_role). Bisher
--      konnte HR es über die Policy «Edit certificates» (FOR ALL) direkt löschen.
--   3. Registereintrag per Trigger BEFORE DELETE, also auf jedem Löschweg.
--   4. Ersteller-Felder dürfen leer werden; revoked_by_user_id verliert den
--      Fremdschlüssel (der Wert ist nach dem Widerruf eingefroren, 029).
--   5. Löschfunktionen für Mitarbeitende, Firma, Organisation und Konto, dazu
--      ein Löschprotokoll ohne Personendaten.
--
-- Von Hand löschen (SQL-Editor) geht weiterhin, aber bewusst:
--   select set_config('zeugnio.loeschen', 'on', true);  -- in derselben Transaktion
--
-- Einspielen: Supabase von Hand im SQL-Editor, vor dem Merge (der neue Code
-- ruft die Funktionen auf). advisori01: migrate.mjs, danach
-- 901_nine_rechte.sql erneut (neue Tabellen) und PostgREST neu laden.
-- Idempotent.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Prüfregister
-- ----------------------------------------------------------------------------
create table if not exists public.certificate_register (
  certificate_id   uuid primary key,          -- frühere certificates.id, ohne Fremdschlüssel
  hash             text not null,             -- gespeicherter Siegel-Hash (v2) bzw. Text-Hash (v1)
  body_hash        text,                      -- SHA-256 nur über den kanonischen Text
  hash_version     smallint not null default 1,
  status           text not null check (status in ('final', 'revoked')),
  finalized_at     timestamptz,
  revoked_at       timestamptz,
  signature        text,
  signing_key_id   text,
  employer         text,
  document_title   text,
  verified_domain  text,
  registered_at    timestamptz not null default now(),
  delete_after     timestamptz not null
);

create index if not exists idx_certificate_register_hash on public.certificate_register (hash);
create index if not exists idx_certificate_register_body_hash on public.certificate_register (body_hash);
create index if not exists idx_certificate_register_delete_after on public.certificate_register (delete_after);

alter table public.certificate_register enable row level security;
-- Keine Policy: anon und authenticated sehen nichts. Die Prüfung liest mit dem
-- Service-Client.
revoke all on table public.certificate_register from anon, authenticated;
grant select, insert, delete on table public.certificate_register to service_role;

comment on table public.certificate_register is
  'Prüfregister gelöschter, ausgestellter Zeugnisse (036). Keine Personendaten. Frist: delete_after (10 Jahre ab Ausstellung).';

-- Löschprotokoll: wer wann was gelöscht hat, ohne Personendaten der Betroffenen.
create table if not exists public.deletion_log (
  id                 bigint generated always as identity primary key,
  deleted_at         timestamptz not null default now(),
  actor_user_id      uuid,                    -- ohne Fremdschlüssel: überlebt die Kontolöschung
  scope              text not null check (scope in ('employee', 'company', 'organization', 'account')),
  organization_id    uuid,
  company_id         uuid,
  company_name       text,
  employees_deleted  integer not null default 0,
  certificates_deleted integer not null default 0,
  certificates_registered integer not null default 0
);

alter table public.deletion_log enable row level security;
revoke all on table public.deletion_log from anon, authenticated;
grant select, insert on table public.deletion_log to service_role;

comment on table public.deletion_log is
  'Löschprotokoll (036): Umfang und auslösende Person, keine Namen oder Texte der gelöschten Mitarbeitenden.';

-- ----------------------------------------------------------------------------
-- 2. Löschsperre für ausgestellte Zeugnisse
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER: current_user ist der Aufrufer, damit die service_role-
-- Ausnahme nur für den Server-Schlüssel gilt (wie 029).
create or replace function public.zeugnio_certificate_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('final', 'revoked')
     and current_user is distinct from 'service_role'
     and coalesce(current_setting('zeugnio.loeschen', true), '') <> 'on' then
    raise exception
      'Zeugnis % ist ausgestellt. Es lässt sich nur zusammen mit der Person oder der Firma löschen.', old.id
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_certificate_delete_guard on public.certificates;
create trigger trg_certificate_delete_guard
  before delete on public.certificates
  for each row execute function public.zeugnio_certificate_delete_guard();

-- ----------------------------------------------------------------------------
-- 3. Registereintrag beim Löschen
-- ----------------------------------------------------------------------------
-- Läuft nach der Sperre (Trigger feuern alphabetisch: delete_guard < register).
-- SECURITY DEFINER, damit der Eintrag auf jedem Löschweg entsteht, auch wenn
-- der Aufrufer das Register selbst nicht beschreiben darf.
create or replace function public.zeugnio_certificate_register()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employer text;
  v_title text;
  v_domain text;
begin
  if old.status not in ('final', 'revoked') or old.hash is null then
    return old;
  end if;

  -- v2: eingefrorene Angaben aus dem Siegel. v1: lebende Firma (noch da,
  -- weil die Löschfunktionen die Zeugnisse vor der Firma löschen).
  v_employer := old.meta_snapshot ->> 'employer';
  if v_employer is null then
    select name into v_employer from public.companies where id = old.company_id;
  end if;

  v_title := old.meta_snapshot ->> 'documentTitle';
  if v_title is null then
    -- wie certificateTypeLabel() in lib/certificate/certificate-title.ts
    v_title := case old.type
      when 'zwischen' then 'Zwischenzeugnis'
      when 'arbeitsbestaetigung' then 'Arbeitsbestätigung'
      else 'Arbeitszeugnis'
    end;
  end if;

  select domain into v_domain
  from public.company_domains
  where company_id = old.company_id and status = 'verified'
  order by verified_at
  limit 1;

  insert into public.certificate_register (
    certificate_id, hash, body_hash, hash_version, status, finalized_at, revoked_at,
    signature, signing_key_id, employer, document_title, verified_domain, delete_after
  ) values (
    old.id,
    old.hash,
    -- Gleich wie hashBodyV1(): SHA-256 (UTF-8, hex) über den kanonischen Text.
    case when old.canonical_content is not null
      then encode(sha256(convert_to(old.canonical_content, 'UTF8')), 'hex') end,
    coalesce(old.hash_version, 1),
    old.status,
    old.finalized_at,
    old.revoked_at,
    old.signature,
    old.signing_key_id,
    v_employer,
    v_title,
    v_domain,
    coalesce(old.finalized_at, now()) + interval '10 years'
  )
  on conflict (certificate_id) do nothing;

  return old;
end;
$$;

drop trigger if exists trg_certificate_register on public.certificates;
create trigger trg_certificate_register
  before delete on public.certificates
  for each row execute function public.zeugnio_certificate_register();

-- ----------------------------------------------------------------------------
-- 4. Ersteller-Felder: Konto löschen ohne Zeugnisse mitzureissen
-- ----------------------------------------------------------------------------
alter table public.companies alter column created_by_user_id drop not null;
alter table public.certificates alter column created_by_user_id drop not null;

do $$
declare r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and rel.relnamespace = 'public'::regnamespace
      and (rel.relname, att.attname) in (
        ('companies', 'created_by_user_id'),
        ('certificates', 'created_by_user_id'),
        ('certificates', 'revoked_by_user_id')
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.companies
  add constraint companies_created_by_user_id_fkey
  foreign key (created_by_user_id) references public.profiles (id) on delete set null;
alter table public.certificates
  add constraint certificates_created_by_user_id_fkey
  foreign key (created_by_user_id) references public.profiles (id) on delete set null;
-- revoked_by_user_id bleibt ohne Fremdschlüssel: Nach dem Widerruf ist der Wert
-- eingefroren (029), ein SET NULL würde dort scheitern. Nach einer
-- Kontolöschung zeigt er auf ein gelöschtes Konto.

-- ----------------------------------------------------------------------------
-- 5. Löschfunktionen
-- ----------------------------------------------------------------------------

-- Gemeinsamer Kern: eine Firma samt Zeugnissen und Mitarbeitenden. Nur aus den
-- Funktionen unten aufrufen (Rechte prüfen diese); nicht für authenticated frei.
create or replace function public.zeugnio_purge_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_org uuid;
  v_logo text;
  v_certs integer;
  v_registered integer;
  v_employees integer;
begin
  select name, organization_id, logo_url into v_name, v_org, v_logo
  from public.companies where id = p_company_id;
  if not found then
    raise exception 'Firma nicht gefunden.' using errcode = 'P0002';
  end if;

  perform set_config('zeugnio.loeschen', 'on', true);

  select count(*) filter (where status in ('final', 'revoked') and hash is not null), count(*)
    into v_registered, v_certs
  from public.certificates where company_id = p_company_id;

  -- Zuerst die Zeugnisse, solange die Firma (Name, Domain) noch da ist.
  delete from public.certificates where company_id = p_company_id;
  delete from public.employees where company_id = p_company_id;
  get diagnostics v_employees = row_count;
  delete from public.companies where id = p_company_id;

  perform set_config('zeugnio.loeschen', '', true);

  return jsonb_build_object(
    'company_id', p_company_id,
    'company_name', v_name,
    'organization_id', v_org,
    'logo_url', v_logo,
    'employees', v_employees,
    'certificates', v_certs,
    'registered', v_registered
  );
end;
$$;

revoke all on function public.zeugnio_purge_company(uuid) from public, anon, authenticated;

-- Eine Person samt ihren Zeugnissen. Darf, wer in der Firma versiegeln darf.
create or replace function public.zeugnio_delete_employee(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_org uuid;
  v_name text;
  v_certs integer;
  v_registered integer;
begin
  select e.company_id, c.organization_id, c.name into v_company, v_org, v_name
  from public.employees e join public.companies c on c.id = e.company_id
  where e.id = p_employee_id;
  if v_company is null then
    raise exception 'Mitarbeitende nicht gefunden.' using errcode = 'P0002';
  end if;
  if not public.zeugnio_can_seal(v_company) then
    raise exception 'Nur wer versiegeln darf (HR-Leitung, Admin), löscht Mitarbeitende.'
      using errcode = '42501';
  end if;

  perform set_config('zeugnio.loeschen', 'on', true);
  select count(*) filter (where status in ('final', 'revoked') and hash is not null), count(*)
    into v_registered, v_certs
  from public.certificates where employee_id = p_employee_id;
  delete from public.certificates where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;
  perform set_config('zeugnio.loeschen', '', true);

  insert into public.deletion_log
    (actor_user_id, scope, organization_id, company_id, company_name,
     employees_deleted, certificates_deleted, certificates_registered)
  values (auth.uid(), 'employee', v_org, v_company, v_name, 1, v_certs, v_registered);

  return jsonb_build_object('certificates', v_certs, 'registered', v_registered);
end;
$$;

-- Eine Firma. Nur die Admin-Person ihrer Organisation.
create or replace function public.zeugnio_delete_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_result jsonb;
begin
  select organization_id into v_org from public.companies where id = p_company_id;
  if v_org is null then
    raise exception 'Firma nicht gefunden.' using errcode = 'P0002';
  end if;
  if not public.zeugnio_is_org_admin(v_org) then
    raise exception 'Nur die Admin-Person der Organisation löscht eine Firma.' using errcode = '42501';
  end if;

  v_result := public.zeugnio_purge_company(p_company_id);

  insert into public.deletion_log
    (actor_user_id, scope, organization_id, company_id, company_name,
     employees_deleted, certificates_deleted, certificates_registered)
  values (auth.uid(), 'company', v_org, p_company_id, v_result ->> 'company_name',
          (v_result ->> 'employees')::int, (v_result ->> 'certificates')::int,
          (v_result ->> 'registered')::int);

  return jsonb_build_object('logo_urls', jsonb_build_array(v_result -> 'logo_url'),
                            'company_ids', jsonb_build_array(p_company_id),
                            'registered', v_result -> 'registered');
end;
$$;

-- Die ganze Organisation mit allen Firmen, Mitgliedschaften und Einladungen.
create or replace function public.zeugnio_delete_organization(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_result jsonb;
  v_logos jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_registered integer := 0;
  v_employees integer := 0;
  v_certs integer := 0;
begin
  if not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'Organisation nicht gefunden.' using errcode = 'P0002';
  end if;
  if not public.zeugnio_is_org_admin(p_org_id) then
    raise exception 'Nur die Admin-Person löscht die Organisation.' using errcode = '42501';
  end if;

  for v_company in select id from public.companies where organization_id = p_org_id loop
    v_result := public.zeugnio_purge_company(v_company);
    v_logos := v_logos || jsonb_build_array(v_result -> 'logo_url');
    v_ids := v_ids || jsonb_build_array(v_company);
    v_registered := v_registered + (v_result ->> 'registered')::int;
    v_employees := v_employees + (v_result ->> 'employees')::int;
    v_certs := v_certs + (v_result ->> 'certificates')::int;
  end loop;

  -- Mitgliedschaften und Einladungen folgen per Kaskade; trg_keep_last_admin
  -- greift nicht, weil die Organisation dann schon weg ist.
  delete from public.organizations where id = p_org_id;

  insert into public.deletion_log
    (actor_user_id, scope, organization_id, employees_deleted, certificates_deleted, certificates_registered)
  values (auth.uid(), 'organization', p_org_id, v_employees, v_certs, v_registered);

  return jsonb_build_object('logo_urls', v_logos, 'company_ids', v_ids, 'registered', v_registered);
end;
$$;

-- Konto. Nur für den Server (service_role): Die Route prüft die Sitzung und
-- löscht danach auch das Anmeldekonto bei Supabase Auth. SECURITY INVOKER,
-- damit current_user service_role bleibt.
create or replace function public.zeugnio_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_blocking text;
begin
  -- Letzte aktive Admin-Person einer Organisation: erst übergeben oder die
  -- Organisation löschen.
  select o.name into v_blocking
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user_id
    and m.role = 'admin'
    and m.deactivated_at is null
    and not exists (
      select 1 from public.organization_members x
      where x.organization_id = m.organization_id
        and x.user_id <> p_user_id
        and x.role = 'admin'
        and x.deactivated_at is null
    )
  limit 1;
  if v_blocking is not null then
    raise exception 'Sie sind die letzte Admin-Person der Organisation «%». Machen Sie zuerst eine andere Person zum Admin oder löschen Sie die Organisation.', v_blocking
      using errcode = '23514';
  end if;

  insert into public.deletion_log (actor_user_id, scope) values (p_user_id, 'account');

  delete from public.profiles where id = p_user_id;
  -- Schlanke auth.users auf advisori01 (902) mit E-Mail: mitlöschen, wo erlaubt.
  -- Bei Supabase löscht die Route das Anmeldekonto über die Admin-Schnittstelle.
  if to_regclass('auth.users') is not null and has_table_privilege('auth.users', 'DELETE') then
    execute 'delete from auth.users where id = $1' using p_user_id;
  end if;

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.zeugnio_delete_employee(uuid) from public, anon;
revoke all on function public.zeugnio_delete_company(uuid) from public, anon;
revoke all on function public.zeugnio_delete_organization(uuid) from public, anon;
revoke all on function public.zeugnio_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.zeugnio_delete_employee(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_delete_company(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_delete_organization(uuid) to authenticated, service_role;
grant execute on function public.zeugnio_delete_account(uuid) to service_role;
