/**
 * zeugnio – Wann gilt der Aussteller als bestätigt?
 * ----------------------------------------------------------------------------
 * Das Siegel beweist den Inhalt, nicht die Berechtigung der ausstellenden
 * Person. Ein einzelnes Konto kann eine Firma unter einem fremden Namen anlegen
 * und finalisieren.
 *
 * Drei Stufen (Sicherheitstest 24.11.2026, Befunde H3 und M2; Entscheid
 * Silvan 25.11.2026):
 *
 *  - "dns"   Die Firma hat einen TXT-Eintrag in ihrer Domain gesetzt. Das kann
 *            nur, wer die Domain verwaltet. Höchste Stufe, freiwillig.
 *  - "mail"  Die angemeldete Person hat eine Mailadresse an genau dieser Domain.
 *            Schliesst den gefährlichsten Fall aus (ein Fremder mit Gmail stellt
 *            sich ein Zeugnis einer bekannten Firma aus). Übrig bleibt die
 *            Insiderin mit Firmenadresse. Gilt als bestätigt, ohne Warnung.
 *  - "none"  Nichts davon: gelbe Warnung auf der Prüfseite.
 *
 * Eine Unterschriften-Freigabe zählt nur, wenn ihre Adresse an der Domain der
 * Firma liegt (DNS- oder Mail-Stufe). Die Adresse tippt die ausstellende Person
 * selbst ein; eine Freigabe an die eigene Gmail belegt nichts (H3).
 *
 * Reine Funktionen ohne Server-Abhängigkeit, damit `npm run test:verify-hash`
 * sie direkt prüfen kann.
 */

import { domainsMatch, emailDomain, normalizeDomain } from "@/lib/company/domain";

export type IssuerLevel = "dns" | "mail" | "none";

type IssuerFields = {
  verifiedDomain?: string | null;
  emailConfirmedDomain?: string | null;
} | null | undefined;

export function issuerLevel(c: IssuerFields): IssuerLevel {
  if (c?.verifiedDomain) return "dns";
  if (c?.emailConfirmedDomain) return "mail";
  return "none";
}

/** Bestätigt ist der Aussteller mit DNS- oder Mail-Stufe. */
export function isIssuerConfirmed(c: IssuerFields): boolean {
  return issuerLevel(c) !== "none";
}

/** Untertitel im Kopf des Prüfergebnisses. */
export function issuerHeadline(c: IssuerFields): string {
  switch (issuerLevel(c)) {
    case "dns":
      return "Aussteller bestätigt · Domain geprüft";
    case "mail":
      return "Aussteller über Firmen-Mailadresse bestätigt";
    default:
      return "Aussteller nicht bestätigt";
  }
}

/**
 * Liegt die Freigabe-Adresse an der bestätigten Domain der Firma (oder an einer
 * Subdomain davon)? Ohne bestätigte Domain nie.
 */
export function isSignoffOnVerifiedDomain(
  signoffEmail: string | null | undefined,
  verifiedDomain: string | null | undefined,
): boolean {
  return domainsMatch(normalizeDomain(verifiedDomain ?? null), emailDomain(signoffEmail));
}
