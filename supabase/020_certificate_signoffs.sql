-- ============================================================================
-- 020_certificate_signoffs.sql  (V2 — identitaetsgebundene Unterzeichner-Freigabe)
-- ============================================================================
-- PROBLEM (Fortsetzung des Self-Issue-Findings): Unterzeichnende sind heute
--   FREITEXT (Name/Rolle auf Zeugnis oder Firma). Es ist nirgends belegt, dass
--   die genannte Person das Zeugnis tatsaechlich freigegeben hat — ein Aussteller
--   traegt beliebige Namen ein.
--
-- LOESUNG (V2): Eine benannte Person bestaetigt das Zeugnis aktiv per Magic-Link
--   (Token in einer E-Mail an genau diese Person). Die bestaetigende E-Mail ist
--   die Identitaetsbindung; Zeitpunkt/IP/User-Agent werden protokolliert. Die
--   Bestaetigung erscheint danach im PDF (Renderer kann signatoryXEmail/
--   signatoryXConfirmedAt bereits) und als Trust-Signal in der oeffentlichen
--   Pruefung.
--
-- ABGESTUFT, KEIN HARD-BLOCK: Das Finalisieren wird durch V2 NICHT blockiert
--   (voller Bestandsschutz, bestehender Ablauf bleibt). Die Freigabe ist ein
--   zusaetzliches, staerkeres Vertrauenssignal — analog zur Domain aus V1.
--
-- Body-Hash unveraendert; Sentinels/Theme-IDs unberuehrt. Die Bestaetigung
--   liegt in DIESER Tabelle, nicht in `certificates` — der H1-Immutabilitaets-
--   Trigger (017) wird also nicht beruehrt und eine Bestaetigung ist auch nach
--   dem Finalisieren noch moeglich.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

create table if not exists public.certificate_signoffs (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  -- Welcher Unterschrifts-Slot (1 oder 2), spiegelt signatory_1/2 im PDF.
  slot smallint not null check (slot in (1, 2)),
  -- E-Mail der freigebenden Person = Identitaetsbindung. Name/Rolle werden beim
  -- Anfordern serverseitig aus den effektiven Unterzeichnenden uebernommen.
  email text not null,
  name text,
  role text,
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'viewed', 'confirmed', 'declined', 'expired')),
  sent_at timestamptz,
  viewed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_ip text,
  confirmed_user_agent text,
  expires_at timestamptz not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nur EINE aktive Freigabe pro Slot und Zeugnis (erneutes Anfordern ersetzt sie
-- via upsert -> alter Token wird ungueltig).
create unique index if not exists uq_certificate_signoffs_cert_slot
  on public.certificate_signoffs (certificate_id, slot);

create index if not exists idx_certificate_signoffs_token
  on public.certificate_signoffs (token);
create index if not exists idx_certificate_signoffs_certificate
  on public.certificate_signoffs (certificate_id);

-- ----------------------------------------------------------------------------
-- RLS: Mitglieder LESEN die Freigaben ihrer Zeugnisse (fuer die Status-Anzeige).
-- SCHREIBEN geht ausschliesslich ueber die API (Service-Role): das Anfordern
-- nach Ownership-Check, das Bestaetigen ueber den oeffentlichen Token-Flow. Es
-- gibt bewusst KEINE insert/update-Policy fuer `authenticated`, damit niemand
-- per rohem PostgREST eine Bestaetigung faelschen kann.
-- ----------------------------------------------------------------------------
alter table public.certificate_signoffs enable row level security;

drop policy if exists "Members can view certificate signoffs" on public.certificate_signoffs;
create policy "Members can view certificate signoffs" on public.certificate_signoffs
  for select using (
    exists (
      select 1
      from public.certificates cert
      join public.companies c on c.id = cert.company_id
      where cert.id = certificate_signoffs.certificate_id
        and (
          c.created_by_user_id = auth.uid()
          or exists (
            select 1 from public.company_members m
            where m.company_id = c.id and m.user_id = auth.uid()
          )
        )
    )
  );

-- updated_at automatisch nachfuehren.
create or replace function public.touch_certificate_signoffs_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists touch_certificate_signoffs_updated_at on public.certificate_signoffs;
create trigger touch_certificate_signoffs_updated_at
  before update on public.certificate_signoffs
  for each row
  execute function public.touch_certificate_signoffs_updated_at();
