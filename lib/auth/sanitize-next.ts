/**
 * Validiert ein `next`-Redirect-Ziel aus der URL. Lässt NUR relative,
 * selbst-verlinkende Pfade zu (Schutz vor Open-Redirect via `?next=https://evil.tld`
 * oder `?next=//evil.tld`). Alles andere fällt auf `fallback` zurück.
 *
 * Auch abgelehnt: Rückwärtsschrägstriche und Steuerzeichen. Browser lesen
 * `/\evil.tld` wie `//evil.tld`, also als fremde Adresse (seit Cutover B, weil
 * `next` jetzt auch im Link der Anmelde-Mail mitreist).
 */
export function sanitizeNext(
  next: string | null | undefined,
  fallback = "/app/dashboard",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
