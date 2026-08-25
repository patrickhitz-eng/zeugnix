/**
 * Ein Zeugnis ist "gesperrt", sobald es 'final' oder 'revoked' ist – beides
 * Endzustaende (siehe supabase/017_certificate_immutability.sql und
 * supabase/021_revocation_and_audit_log.sql fuer die DB-seitige Durchsetzung
 * per Trigger). Inhalt, Schlusssatz und Unterzeichnende werden dann
 * schreibgeschuetzt; nur Archivieren und Widerrufen bleiben moeglich.
 */
export function isCertificateLocked(status: string | null | undefined): boolean {
  return status === "final" || status === "revoked";
}
