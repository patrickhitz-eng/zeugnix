/**
 * zeugnio – Wann gilt der Aussteller als bestätigt?
 * ----------------------------------------------------------------------------
 * Das Siegel beweist den Inhalt, nicht die Berechtigung der ausstellenden
 * Person. Ein einzelnes Konto kann eine Firma unter einem fremden Namen anlegen
 * und finalisieren.
 *
 * Bis zum 24.11.2026 galt der Aussteller auch dann als bestätigt, wenn eine
 * unterzeichnende Person das Zeugnis per E-Mail freigegeben hatte. Die Adresse
 * dafür tippt aber die ausstellende Person selbst ein. Wer sich ein Zeugnis
 * einer fremden Firma ausstellt, schickt die Freigabe an die eigene Gmail und
 * bekam so «Aussteller bestätigt» (Sicherheitstest 24.11.2026, Befund H3).
 *
 * Seither gilt:
 *  - Bestätigt ist der Aussteller nur mit verifizierter Firmen-Domain.
 *  - Eine Freigabe zählt als Bestätigung der unterzeichnenden Person nur, wenn
 *    die Freigabe-Adresse an dieser verifizierten Domain liegt. Sonst wird sie
 *    angezeigt, aber ausdrücklich als «Adresse nicht geprüft».
 *
 * Reine Funktionen ohne Server-Abhängigkeit, damit `npm run test:verify-hash`
 * sie direkt prüfen kann.
 */

import { domainsMatch, emailDomain, normalizeDomain } from "@/lib/company/domain";

/** Bestätigt ist der Aussteller nur über die verifizierte Firmen-Domain. */
export function isIssuerConfirmed(c: { verifiedDomain?: string | null } | null | undefined): boolean {
  return Boolean(c?.verifiedDomain);
}

/**
 * Liegt die Freigabe-Adresse an der verifizierten Domain der Firma (oder an
 * einer Subdomain davon)? Ohne verifizierte Domain nie.
 */
export function isSignoffOnVerifiedDomain(
  signoffEmail: string | null | undefined,
  verifiedDomain: string | null | undefined,
): boolean {
  return domainsMatch(normalizeDomain(verifiedDomain ?? null), emailDomain(signoffEmail));
}
