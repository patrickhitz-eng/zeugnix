-- ============================================================================
-- zeugnix.ch – Supabase Schema (Migration 001)
-- ----------------------------------------------------------------------------
-- Dieses Schema legt alle Tabellen, Enums, Indizes und Row-Level-Security-
-- Policies an. Kompatibel mit Supabase (PostgreSQL 15+).
--
-- Ausführung:
--   In Supabase Dashboard → SQL Editor → komplettes File einfügen → Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('hr_admin', 'manager', 'verifier', 'superadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type certificate_type as enum (
    'schluss', 'zwischen', 'funktionswechsel', 'vorgesetztenwechsel',
    'interner_wechsel', 'reorganisation', 'wunsch_mitarbeiterin', 'wunsch_mitarbeiter'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type certificate_status as enum ('draft', 'pending_manager', 'manager_submitted', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rating_value as enum ('ungenuegend', 'genuegend', 'gut', 'sehr_gut');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employee_type as enum ('mitarbeiter', 'fuehrungskraft');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('m', 'f', 'd');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tonality as enum ('positiv', 'neutral', 'kritisch');
exception when duplicate_object then null; end $$;

do $$ begin
  create type signal_strength as enum ('eindeutig', 'mittel', 'schwach');
exception when duplicate_object then null; end $$;

do $$ begin
  create type warning_level as enum ('keine', 'potenziell_schwach', 'potenziell_kritisch');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_type as enum ('verify_only', 'analysis_only', 'premium_check', 'company_subscription');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verify_result as enum ('verified', 'mismatch', 'unknown');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tabelle: profiles
-- Spiegel der Supabase auth.users mit Rolle und Stammdaten
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role user_role not null default 'hr_admin',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);

-- ----------------------------------------------------------------------------
-- Tabelle: companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  city text,
  postal_code text,
  logo_url text,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  has_employer_badge boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_companies_owner on public.companies(created_by_user_id);

-- Junction für Mehrbenutzer pro Firma (HR-Team)
create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role user_role not null default 'hr_admin',
  added_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Tabelle: employees
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  gender gender_type not null default 'd',
  function_title text not null,
  department text,
  entry_date date not null,
  exit_date date,
  employment_percentage int check (employment_percentage between 1 and 100),
  work_location text,
  is_manager boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_company on public.employees(company_id);

-- ----------------------------------------------------------------------------
-- Tabelle: certificates
-- ----------------------------------------------------------------------------
create table if not exists public.certificates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  type certificate_type not null,
  reason text,
  tasks text[],
  status certificate_status not null default 'draft',
  version int not null default 1,
  generated_text text,
  canonical_content text,
  hash text,
  pdf_storage_path text,
  qr_code_url text,
  thank_employee boolean not null default true,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_certificates_company on public.certificates(company_id);
create index if not exists idx_certificates_hash on public.certificates(hash) where hash is not null;
create index if not exists idx_certificates_status on public.certificates(status);

-- ----------------------------------------------------------------------------
-- Tabelle: manager_invitations
-- Magic-Link-basierte Einladung für Führungskräfte (kein Account nötig)
-- ----------------------------------------------------------------------------
create table if not exists public.manager_invitations (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  manager_email text not null,
  manager_name text,
  token text not null unique,
  status text not null default 'pending', -- pending | viewed | submitted | expired
  expires_at timestamptz not null,
  viewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitations_token on public.manager_invitations(token);
create index if not exists idx_invitations_certificate on public.manager_invitations(certificate_id);

-- ----------------------------------------------------------------------------
-- Tabelle: evaluations
-- Beurteilungen pro Kategorie durch die Führungskraft
-- ----------------------------------------------------------------------------
create table if not exists public.evaluations (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  invitation_id uuid references public.manager_invitations(id) on delete set null,
  submitted_by_email text not null,
  category text not null,
  subcategory text,
  rating rating_value not null,
  selected_phrase_id uuid,
  free_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_evaluations_certificate on public.evaluations(certificate_id);

-- ----------------------------------------------------------------------------
-- Tabelle: phrase_blocks
-- Bausteinbibliothek für die Zeugnis-Generierung und Analyse
-- ----------------------------------------------------------------------------
create table if not exists public.phrase_blocks (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  subcategory text,
  employee_type employee_type not null default 'mitarbeiter',
  gender gender_type not null default 'd',
  rating rating_value not null,
  variant int not null default 1,
  text text not null,
  signal_strength signal_strength not null default 'mittel',
  tonality tonality not null default 'neutral',
  warning_level warning_level not null default 'keine',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_phrases_category on public.phrase_blocks(category);
create index if not exists idx_phrases_lookup on public.phrase_blocks(category, employee_type, gender, rating, active);

-- ----------------------------------------------------------------------------
-- Tabelle: verifications
-- Hochgeladene PDFs für die Echtheitsprüfung
-- ----------------------------------------------------------------------------
create table if not exists public.verifications (
  id uuid primary key default uuid_generate_v4(),
  uploaded_file_path text not null,
  extracted_text text,
  extracted_canonical_content text,
  calculated_hash text,
  matched_certificate_id uuid references public.certificates(id) on delete set null,
  result verify_result,
  paid boolean not null default false,
  stripe_payment_id text,
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_verifications_hash on public.verifications(calculated_hash);

-- ----------------------------------------------------------------------------
-- Tabelle: analyses
-- Klartext-Analysen hochgeladener Zeugnisse
-- ----------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default uuid_generate_v4(),
  verification_id uuid references public.verifications(id) on delete set null,
  uploaded_file_path text not null,
  extracted_text text,
  overall_score numeric(4,2),
  overall_rating rating_value,
  confidence_level text, -- hoch | mittel | tief
  category_scores jsonb,
  strengths text[],
  weaknesses text[],
  closing_formula_rating text,
  warnings text[],
  summary text,
  report_pdf_path text,
  paid boolean not null default false,
  stripe_payment_id text,
  user_email text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabelle: payments
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  verification_id uuid references public.verifications(id) on delete set null,
  analysis_id uuid references public.analyses(id) on delete set null,
  stripe_payment_id text not null unique,
  stripe_session_id text,
  product product_type not null,
  amount_chf numeric(10,2) not null,
  currency text not null default 'CHF',
  status text not null default 'pending', -- pending | succeeded | failed | refunded
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_stripe on public.payments(stripe_payment_id);

-- ----------------------------------------------------------------------------
-- Tabelle: employer_badges
-- ----------------------------------------------------------------------------
create table if not exists public.employer_badges (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  badge_type text not null default 'verified_certificate_employer',
  issued_at timestamptz not null default now(),
  active boolean not null default true,
  unique (company_id, badge_type)
);

-- ============================================================================
-- Trigger: profile auto-create bei Auth-User-Insert
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Trigger: updated_at automatisch pflegen
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger set_profiles_updated_at before update on public.profiles
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_companies_updated_at before update on public.companies
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_employees_updated_at before update on public.employees
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_certificates_updated_at before update on public.certificates
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Row Level Security (RLS)
-- ----------------------------------------------------------------------------
-- Wichtigste Regeln:
-- - Profile: jeder sieht nur sich selbst
-- - Companies: nur Mitglieder sehen ihre Firma
-- - Employees / Certificates: nur über company_members zugänglich
-- - phrase_blocks: lesbar für alle eingeloggten User (zum Generieren)
-- - manager_invitations: über token zugänglich (Service Role)
-- - verifications/analyses: anonym schreibbar (Service Role aus API),
--   für eingeloggte User nur eigene
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.employees enable row level security;
alter table public.certificates enable row level security;
alter table public.manager_invitations enable row level security;
alter table public.evaluations enable row level security;
alter table public.phrase_blocks enable row level security;
alter table public.verifications enable row level security;
alter table public.analyses enable row level security;
alter table public.payments enable row level security;
alter table public.employer_badges enable row level security;

-- Profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Companies (über company_members)
drop policy if exists "Members can view companies" on public.companies;
create policy "Members can view companies" on public.companies
  for select using (
    exists (
      select 1 from public.company_members
      where company_id = companies.id and user_id = auth.uid()
    )
    or created_by_user_id = auth.uid()
  );
drop policy if exists "Authenticated users can create companies" on public.companies;
create policy "Authenticated users can create companies" on public.companies
  for insert with check (auth.uid() = created_by_user_id);
drop policy if exists "Owners can update companies" on public.companies;
create policy "Owners can update companies" on public.companies
  for update using (created_by_user_id = auth.uid());

-- Company Members
drop policy if exists "Members see own membership" on public.company_members;
create policy "Members see own membership" on public.company_members
  for select using (user_id = auth.uid());

-- Employees
drop policy if exists "Members can manage employees" on public.employees;
create policy "Members can manage employees" on public.employees
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = employees.company_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- Certificates
drop policy if exists "Members can manage certificates" on public.certificates;
create policy "Members can manage certificates" on public.certificates
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = certificates.company_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- Manager Invitations: nur HR-Member kann erstellen
drop policy if exists "Members can manage invitations" on public.manager_invitations;
create policy "Members can manage invitations" on public.manager_invitations
  for all using (
    exists (
      select 1 from public.certificates cert
      join public.companies c on c.id = cert.company_id
      where cert.id = manager_invitations.certificate_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- Evaluations: Service Role schreibt (über API mit Token-Validierung).
-- Member darf lesen.
drop policy if exists "Members can read evaluations" on public.evaluations;
create policy "Members can read evaluations" on public.evaluations
  for select using (
    exists (
      select 1 from public.certificates cert
      join public.companies c on c.id = cert.company_id
      where cert.id = evaluations.certificate_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- Phrase Blocks: lesbar für alle Authentifizierten
drop policy if exists "Authenticated can read phrases" on public.phrase_blocks;
create policy "Authenticated can read phrases" on public.phrase_blocks
  for select using (auth.role() = 'authenticated');

-- Verifications & Analyses: User sieht nur eigene (über email)
drop policy if exists "Users can see own verifications" on public.verifications;
create policy "Users can see own verifications" on public.verifications
  for select using (
    user_email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can see own analyses" on public.analyses;
create policy "Users can see own analyses" on public.analyses
  for select using (
    user_email = (select email from public.profiles where id = auth.uid())
  );

-- Payments
drop policy if exists "Users can see own payments" on public.payments;
create policy "Users can see own payments" on public.payments
  for select using (
    user_id = auth.uid()
    or user_email = (select email from public.profiles where id = auth.uid())
  );

-- Employer Badges
drop policy if exists "Members can view badges" on public.employer_badges;
create policy "Members can view badges" on public.employer_badges
  for select using (
    exists (
      select 1 from public.companies c
      where c.id = employer_badges.company_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- Storage Buckets
-- ----------------------------------------------------------------------------
-- Diese müssen separat über das Supabase Dashboard erstellt werden:
-- 1. company-logos (public)
-- 2. certificates (private)
-- 3. uploads (private)  -- für hochgeladene PDFs zur Verifikation
-- 4. reports (private)  -- für generierte Verifikations-/Analyseberichte
-- ============================================================================

-- Done.
