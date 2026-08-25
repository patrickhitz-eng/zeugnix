-- ============================================================================
-- 019_company_domains.sql  (V1 — verifizierte Aussteller-Domain)
-- ============================================================================
-- PROBLEM (Audit-Finding „Self-Issue-Loch"): Eine Firma anzulegen ist ein
--   ungeprüfter Client-Insert. Ein einzelner Account kann eine Firma „ACME AG"
--   erfinden, sich selbst ein Zeugnis ausstellen, finalisieren -> gültiger
--   „Echt"-Hash, OHNE dass irgendwo nachgewiesen ist, dass der Aussteller
--   wirklich zu dieser Firma gehört. Der Hash beweist Inhalts-Identität, NICHT
--   Urheberschaft/Berechtigung.
--
-- LÖSUNG (Phase 1, günstig): Eine Firma kann eine Domain deklarieren und
--   verifizieren. Verifiziert = es ist belegt, dass ein berechtigter Mensch mit
--   einer E-Mail-Adresse @dieser-domain hinter der Firma steht.
--   * Methode 'email' (V1): Der Login läuft über Magic-Link/OTP, d.h. die E-Mail
--     des eingeloggten Users ist BEREITS verifiziert. Endet sie auf genau die
--     deklarierte (Nicht-Freemail-)Domain -> Domain gilt als „per E-Mail bestätigt".
--   * Methode 'dns' (Phase 2, hier nur vorbereitet): TXT-Record
--     `zeugnio-verify=<token>` auf der Domain, serverseitig via DNS geprüft.
--
-- Diese Tabelle ist ein reines Trust-Signal NEBEN dem Zeugnis. Sie ändert den
--   Hash NICHT, berührt Sentinels/Theme-IDs NICHT und blockiert das Finalisieren
--   NICHT (abgestuftes Trust-Level statt Hard-Block -> voller Bestandsschutz).
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

create table if not exists public.company_domains (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Normalisiert (kleingeschrieben, ohne Protokoll/Pfad, IDN als punycode).
  -- Normalisierung passiert in lib/company/domain.ts; die DB speichert das Ergebnis.
  domain text not null,
  method text not null default 'email' check (method in ('email', 'dns')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  -- Nur für Methode 'dns' (Phase 2): der zufällige TXT-Token.
  dns_token text,
  verified_at timestamptz,
  -- Wer die Verifikation ausgelöst hat (bei 'email': der User, dessen
  -- verifizierte E-Mail auf die Domain passte). set null, damit ein
  -- gelöschtes Profil die Domain nicht mitreisst.
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eine Domain pro Firma nur einmal (erlaubt upsert onConflict).
create unique index if not exists uq_company_domains_company_domain
  on public.company_domains (company_id, domain);

-- ANTI-IMPERSONATION (Kern der Sicherheit): dieselbe Domain darf nur von EINER
-- Firma VERIFIZIERT sein. Zwei Firmen dürfen dieselbe Domain als 'pending'
-- führen, aber sobald eine sie verifiziert, ist sie exklusiv. Partieller
-- Unique-Index -> nur verifizierte Zeilen kollidieren.
create unique index if not exists uq_company_domains_verified
  on public.company_domains (domain)
  where status = 'verified';

create index if not exists idx_company_domains_company
  on public.company_domains (company_id);

-- ----------------------------------------------------------------------------
-- RLS: Mitglieder LESEN die Domains ihrer Firma. SCHREIBEN geht ausschliesslich
-- über die API mit Service-Role (die den E-Mail-Besitz prüft). Es gibt bewusst
-- KEINE insert/update/delete-Policy für `authenticated` — sonst könnte ein
-- Mitglied per rohem PostgREST einfach eine Zeile status='verified' einfügen und
-- die ganze Prüfung aushebeln. Service-Role umgeht RLS.
-- ----------------------------------------------------------------------------
alter table public.company_domains enable row level security;

drop policy if exists "Members can view company domains" on public.company_domains;
create policy "Members can view company domains" on public.company_domains
  for select using (
    exists (
      select 1 from public.companies c
      where c.id = company_domains.company_id
        and (
          c.created_by_user_id = auth.uid()
          or exists (
            select 1 from public.company_members m
            where m.company_id = c.id and m.user_id = auth.uid()
          )
        )
    )
  );

-- updated_at automatisch nachführen (spiegelt das Muster anderer Tabellen).
create or replace function public.touch_company_domains_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists touch_company_domains_updated_at on public.company_domains;
create trigger touch_company_domains_updated_at
  before update on public.company_domains
  for each row
  execute function public.touch_company_domains_updated_at();
