-- ============================================================================
-- 027_company_certificate_footer.sql
-- Ausstellerspezifische Fusszeile für das Zeugnis-Dokument
-- ============================================================================
-- Hält einen frei editierbaren Fusszeilen-Text PRO FIRMA. Erscheint am unteren
-- Rand jeder Seite des Zeugnis-PDFs (und der A4-Vorschau), analog dazu, wie
-- companies.default_certificate_font_family die Markenfarbe pro Aussteller hält.
--
-- Zweck (Wunsch Christoph, Call 2026-10-07): bisher kopierten Aussteller den
-- Zeugnistext in eine eigene Word-Vorlage, nur um dort ihre firmenspezifische
-- Fusszeile (z. B. Handelsregister-Nr., Haftungshinweis) unterzubringen. Mit
-- diesem Feld trägt zeugnio.ch die Fusszeile direkt im Dokument.
--
-- Bewusst NICHT Teil des Echtheits-Hash: die Fusszeile ist Aussteller-Branding
-- (wie Logo/Briefkopf), kein Zeugnistext. Sie steht ausserhalb der Body-/Meta-
-- Sentinels und verändert weder den v1-Body-Hash noch den v2-Meta-Hash.
--
-- Mehrzeilig erlaubt (Zeilenumbrüche im Text werden im Dokument übernommen).
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

alter table public.companies
  add column if not exists certificate_footer text;

comment on column public.companies.certificate_footer is
  'Ausstellerspezifische Fusszeile am Seitenende des Zeugnisses (frei editierbar, mehrzeilig). Kein Bestandteil des Echtheits-Hash.';
