-- ============================================================================
-- 031_terms_acceptances.sql  (Fahrplan Marktstart, Schritt 11)
-- ============================================================================
-- PROBLEM: Die Registrierung ist offen. Jede Firma meldet sich selbst an, es
--   gibt keinen unterschriebenen Einzelvertrag. Bisher stand beim Login nur ein
--   Hinweistext; ob und welche AGB-Fassung jemand angenommen hat, war nirgends
--   belegt.
--
-- LOESUNG: Pro Person und AGB-Fassung eine Zeile mit Zeitpunkt. Der
--   Arbeitsbereich (app/(authed)/app/layout.tsx) laesst nur durch, wer die
--   aktuelle Fassung (lib/legal/terms.ts) angenommen hat; sonst geht es ueber
--   /app/zustimmung. Neue Fassung = neue Zeile, alte Zeilen bleiben als Beleg.
--
-- Der Zeitpunkt kommt aus der Datenbank (default now()), nicht vom Browser.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix"),
--   VOR dem Code-Deploy. Fehlt die Tabelle, laesst die App alle durch (niemand
--   wird ausgesperrt), es wird dann aber auch keine Zustimmung gespeichert.
-- ----------------------------------------------------------------------------

create table if not exists public.terms_acceptances (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version)
);

-- ----------------------------------------------------------------------------
-- RLS: Jede Person LIEST nur ihre eigenen Zeilen (Pruefung im Layout).
-- SCHREIBEN geht ausschliesslich ueber /api/terms/accept (Service-Role). Es gibt
-- bewusst KEINE insert/update-Policy fuer `authenticated`, damit niemand per
-- rohem PostgREST einen anderen Zeitpunkt oder eine andere Fassung eintraegt.
-- ----------------------------------------------------------------------------
alter table public.terms_acceptances enable row level security;

drop policy if exists "Users can view own terms acceptances" on public.terms_acceptances;
create policy "Users can view own terms acceptances" on public.terms_acceptances
  for select using (user_id = auth.uid());

-- Kontrolle nach dem Einspielen:
-- select count(*) from public.terms_acceptances;   -- 0 direkt nach dem Anlegen
