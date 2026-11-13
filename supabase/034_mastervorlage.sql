-- ============================================================================
-- 034_mastervorlage.sql
-- Mastervorlage pro Firma (Schritt 30 im Marktstart-Fahrplan)
-- ============================================================================
-- Ziel: Niemand muss mehr nach Word, und HR kann die Vorgaben nicht verändern.
-- Der Admin der Organisation pflegt pro Firma, was bisher nur per SQL ging oder
-- gar nicht ging. Entscheide vom 13.11.2026 (Silvan, E2):
--
--   brand_accent             Eigene Akzentfarbe (#rrggbb) zum gewählten Stil.
--                            Die App prüft den Kontrast gegen Papierweiss
--                            (WCAG AA 4.5:1); die DB prüft nur das Format.
--                            Firsts Marken-Themes (brand-*) bleiben unberührt.
--   show_verification_block  Sichtbarer Echtheitsnachweis (Hash, QR, Prüflink)
--                            im PDF und im Word-Dokument. Aus = PDF ohne den
--                            Block, aber weiter per Upload prüfbar (die
--                            unsichtbaren Prüfmarken bleiben); Word trägt dann
--                            eine kleine Zeile «Arbeitskopie, nicht prüfbar».
--   default_zeugnis_typ      Vorauswahl beim Anlegen eines Zeugnisses.
--   default_wertschaetzungsgrad, default_optin_bedauern
--                            Vorgaben für den Schlusssatz neuer Zeugnisse.
--                            HR darf sie pro Zeugnis anpassen.
--   company_description      Fester Firmenbeschrieb; die Textgenerierung setzt
--                            ihn als eigenen Absatz nach den Einleitungssatz.
--                            Damit gehört er zum Zeugnistext und zum Siegel.
--
-- Rechte: keine neuen Policies. Schreiben auf companies darf seit 033 nur der
-- Admin der Organisation (Policy companies_update). Neue Spalten fallen unter
-- die bestehenden Tabellenrechte; auf nine genügt nach dem Einspielen ein
-- `systemctl --user reload postgrest`, 901_nine_rechte.sql muss nicht erneut.
--
-- Sichtbarkeit und Akzent wirken wie Logo und Fusszeile beim Erzeugen des
-- Dokuments, nicht beim Finalisieren. Sie sind kein Teil des Hash.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt «zeugnix»).
-- ----------------------------------------------------------------------------

alter table public.companies
  add column if not exists brand_accent text,
  add column if not exists show_verification_block boolean not null default true,
  add column if not exists default_zeugnis_typ zeugnis_typ,
  add column if not exists default_wertschaetzungsgrad wertschaetzungsgrad,
  add column if not exists default_optin_bedauern boolean not null default false,
  add column if not exists company_description text;

alter table public.companies
  drop constraint if exists companies_brand_accent_format;
alter table public.companies
  add constraint companies_brand_accent_format
  check (brand_accent is null or brand_accent ~ '^#[0-9a-fA-F]{6}$');

alter table public.companies
  drop constraint if exists companies_description_length;
alter table public.companies
  add constraint companies_description_length
  check (company_description is null or char_length(company_description) <= 600);

comment on column public.companies.brand_accent is
  'Eigene Akzentfarbe (#rrggbb) für Titel und Labels im Zeugnis. Kontrast prüft die App (WCAG AA). Kein Bestandteil des Hash.';
comment on column public.companies.show_verification_block is
  'Sichtbarer Echtheitsnachweis (Hash, QR, Prüflink) im Dokument. false: PDF ohne Block, per Upload weiter prüfbar; Word als Arbeitskopie beschriftet.';
comment on column public.companies.default_zeugnis_typ is
  'Vorauswahl des Zeugnistyps beim Anlegen. null = Schlusszeugnis.';
comment on column public.companies.default_wertschaetzungsgrad is
  'Vorgabe für den Wertschätzungsgrad neuer Zeugnisse. null = standard.';
comment on column public.companies.default_optin_bedauern is
  'Vorgabe «Bedauern» im Schlusssatz neuer Schlusszeugnisse.';
comment on column public.companies.company_description is
  'Fester Firmenbeschrieb (max. 600 Zeichen); erscheint als Absatz nach der Einleitung und gehört damit zum versiegelten Text.';
