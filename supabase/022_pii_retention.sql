-- ============================================================================
-- 022_pii_retention.sql  (H4 — PII-Minimierung)
-- ============================================================================
-- Grundlage für die Retention-Bereinigung in app/api/cron/pii-cleanup/route.ts:
-- ein Index auf created_at, damit der taegliche Cron-Scan ("aeltere-als-X-Tage
-- Zeilen finden") nicht die ganze Tabelle durchsuchen muss.
--
-- Der eigentliche Loesch-/Anonymisierungs-Pfad ist bewusst App-Code (Vercel
-- Cron), nicht SQL: so bleibt er beobachtbar (Vercel-Logs) und ohne pg_cron-
-- Abhaengigkeit (nicht in jedem Supabase-Plan verfuegbar).
--
-- Idempotent; manuell in Prod einspielen.
-- ============================================================================

create index if not exists idx_verifications_created_at on public.verifications(created_at);
create index if not exists idx_analyses_created_at on public.analyses(created_at);
