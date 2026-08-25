/**
 * zeugnix.ch – Dokumenttitel je Zeugnistyp
 * ----------------------------------------------------------------------------
 * EINZIGE Quelle für die Zuordnung certificate_type -> angezeigter Titel.
 * Genutzt vom PDF-Renderer (app/api/certificates/[id]/pdf) UND von der
 * Verifikation (app/api/verify), damit der bei der Prüfung zurückgegebene
 * Vergleichstitel exakt dem im PDF gedruckten Titel entspricht.
 */

export const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
  schluss: "Arbeitszeugnis",
  zwischen: "Zwischenzeugnis",
  funktionswechsel: "Arbeitszeugnis",
  vorgesetztenwechsel: "Arbeitszeugnis",
  interner_wechsel: "Arbeitszeugnis",
  reorganisation: "Arbeitszeugnis",
  wunsch_mitarbeiterin: "Arbeitszeugnis",
  wunsch_mitarbeiter: "Arbeitszeugnis",
  arbeitsbestaetigung: "Arbeitsbestätigung",
};

/** Liefert den angezeigten Dokumenttitel; Fallback „Arbeitszeugnis". */
export function certificateTypeLabel(type: string | null | undefined): string {
  return (type && CERTIFICATE_TYPE_LABELS[type]) || "Arbeitszeugnis";
}
