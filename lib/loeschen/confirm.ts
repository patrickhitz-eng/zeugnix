/**
 * Bestätigung durch Abtippen (Firma, Organisation, Konto löschen).
 *
 * Die Eingabe schützt vor einem Fehlklick, nicht vor einem Angreifer. Darum
 * zählt nur, ob die Person den richtigen Namen meint: Gross- und
 * Kleinschreibung, doppelte Leerzeichen und Leerzeichen am Rand spielen keine
 * Rolle. Browser und Server benutzen dieselbe Funktion; vorher prüfte der
 * Browser ohne und der Server mit Gross- und Kleinschreibung, sodass der Knopf
 * aktiv wurde und der Server trotzdem ablehnte (Kundenmeldung 24.11.2026).
 */
export function normalizeConfirmation(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("de-CH");
}

export function confirmationMatches(typed: unknown, expected: string): boolean {
  if (typeof typed !== "string") return false;
  const want = normalizeConfirmation(expected);
  return want.length > 0 && normalizeConfirmation(typed) === want;
}

/**
 * Vergleichsschlüssel für «gibt es diese Firma schon?» beim Anlegen: nur
 * Buchstaben und Ziffern, ohne Gross- und Kleinschreibung. «MUSTER
 * Treuhand Partner AG» und «Muster Treuhand Partner AG.» sind gleich.
 */
export function companyNameKey(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("de-CH")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
