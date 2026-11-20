/**
 * Löschfristen pro Datenart – an EINER Stelle (Schritt 17).
 *
 * Stand 13.11.2026: Vorschlagswerte. Verbindlich legt sie der
 * Auftragsbearbeitungsvertrag fest (Patrick mit dem Anwalt). Wer einen Wert
 * ändert, ändert ihn hier und in der Datenschutzerklärung.
 *
 * Entschieden (Silvan, 20.11.2026): Prüfregister 10 Jahre ab Ausstellung.
 * Der Wert steht so in der Datenschutzerklärung, in der FAQ der Startseite
 * und auf /app/daten (alle lesen registerYears) und gehört so in den AVV.
 * Achtung: Die Datenbank rechnet delete_after selbst (Migration 036). Wer
 * registerYears ändert, braucht dafür eine neue Migration.
 *
 * Abgeräumt werden sie täglich von /api/cron/pii-cleanup. Die Frist des
 * Prüfregisters steht als Spalte delete_after in jeder Zeile; sie wird beim
 * Löschen der Firma gesetzt (Migration 036, 10 Jahre ab Ausstellung), hier
 * steht sie nur zur Dokumentation.
 */
export const RETENTION = {
  /** Hochgeladener Fremdtext und E-Mail aus Prüfung und Analyse. */
  verifyUploadsDays: 180,
  /** IP-Adresse und Browserkennung einer Unterzeichner-Freigabe. */
  signoffEvidenceDays: 365,
  /** Prüfregister gelöschter Zeugnisse, ab Ausstellung (nur Dokumentation). */
  registerYears: 10,
} as const;

export function cutoffIso(days: number, now = Date.now()): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
