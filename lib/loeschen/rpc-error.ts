/**
 * Fehler der Löschfunktionen (Migration 036) in eine HTTP-Antwort übersetzen.
 * Die Funktionen melden selbst verständliche Texte; hier wird nur der Status
 * aus dem Fehlercode abgeleitet.
 */
export function deletionErrorStatus(error: { code?: string } | null | undefined): number {
  switch (error?.code) {
    case "42501":
      return 403; // keine Berechtigung
    case "P0002":
      return 404; // nicht gefunden
    case "23514":
      return 409; // letzte Admin-Person
    default:
      return 500;
  }
}
