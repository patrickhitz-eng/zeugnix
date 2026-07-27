-- ============================================================================
-- 016_certificate_signatories.sql
-- Unterzeichnende Personen pro Zeugnis (Override der Firmenvorgabe)
-- ============================================================================
-- Bisher erben alle Zeugnisse die Unterzeichnenden ausschliesslich von der Firma
-- (companies.signatory_1_name/role, signatory_2_name/role). Diese Spalten halten
-- eine ZEUGNIS-SPEZIFISCHE Wahl fest: ist ein Name gesetzt, überschreibt er die
-- Firmenvorgabe für genau dieses Zeugnis (Rolle ohne Name greift nicht). Bleibt
-- der Wert leer/NULL, gilt weiterhin die Firmenvorgabe.
--
-- Auflösung passiert im Code (lib/certificate/signatories.ts::resolveSignatories),
-- genutzt von PDF-Route und A4-Vorschau. Kein E-Mail-Feld (analog zur Firma:
-- nur Name + Funktion).
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

alter table public.certificates
  add column if not exists signatory_1_name text,
  add column if not exists signatory_1_role text,
  add column if not exists signatory_2_name text,
  add column if not exists signatory_2_role text;
