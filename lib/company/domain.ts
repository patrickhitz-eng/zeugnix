/**
 * Domain-Normalisierung, Freemail-Blocklist und Matching für die
 * Aussteller-Domain-Verifikation (V1).
 *
 * Trust-Anker: Der Login läuft über Magic-Link/OTP, die E-Mail des eingeloggten
 * Users ist also bereits verifiziert. Passt ihre Domain auf die von der Firma
 * deklarierte (Nicht-Freemail-)Domain, gilt die Domain als „per E-Mail bestätigt".
 */

/**
 * Bekannte Freemail-/Provider-Domains. Eine Firma kann sich NICHT über eine
 * dieser Domains verifizieren (jede:r hat eine @gmail.com — das belegt keine
 * Firmenzugehörigkeit). Bewusst inklusive der gängigen CH-Provider.
 * Kleingeschrieben; Vergleich immer gegen normalisierte Domains.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  // International
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.ch",
  "hotmail.de",
  "live.com",
  "live.ch",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.de",
  "ymail.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "gmx.at",
  "gmx.ch",
  "web.de",
  "t-online.de",
  // Schweiz
  "bluewin.ch",
  "sunrise.ch",
  "hispeed.ch",
  "green.ch",
  "swissonline.ch",
  "vtxnet.ch",
  "bluemail.ch",
  "quickline.ch",
  "sputnik.ch",
]);

/**
 * Normalisiert eine deklarierte Domain oder einen Website-Wert zu einem reinen
 * Host in Kleinschreibung. Entfernt Protokoll, Pfad, Port, führendes `www.` und
 * kodiert IDN nach punycode (via WHATWG-URL). Gibt null zurück, wenn kein
 * plausibler Host mit Punkt übrig bleibt.
 *
 * Beispiele:
 *   "https://www.Firma.ch/karriere"  -> "firma.ch"
 *   "Müller.ch"                       -> "xn--mller-kva.ch"
 *   "  ACME AG  "                     -> null
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.trim().toLowerCase();
  if (!raw) return null;

  // Falls jemand eine E-Mail eingibt, den Teil nach dem @ nehmen.
  const at = raw.lastIndexOf("@");
  if (at !== -1) raw = raw.slice(at + 1);

  // WHATWG-URL braucht ein Protokoll, um den Host zu parsen; eines voranstellen,
  // falls keines vorhanden ist.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) {
    raw = "https://" + raw;
  }

  let host: string;
  try {
    host = new URL(raw).hostname; // liefert IDN bereits als punycode
  } catch {
    return null;
  }

  host = host.replace(/^www\./, "");

  // Plausibilität: mindestens ein Punkt, nur erlaubte Zeichen, keine
  // Randpunkte, jedes Label nicht leer.
  if (!host.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.startsWith(".") || host.endsWith(".")) return null;
  if (host.split(".").some((label) => label.length === 0)) return null;

  return host;
}

/**
 * Extrahiert die normalisierte Domain aus einer E-Mail-Adresse.
 * Gibt null zurück, wenn keine plausible Domain ableitbar ist.
 */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return normalizeDomain(email.slice(at + 1));
}

/** true, wenn die (bereits normalisierte) Domain eine Freemail-Domain ist. */
export function isFreeMailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return FREE_MAIL_DOMAINS.has(domain);
}

/**
 * Passt eine (verifizierte) E-Mail-Domain auf eine deklarierte Firmen-Domain?
 * Match, wenn identisch ODER die E-Mail-Domain eine Subdomain der deklarierten
 * Domain ist (z.B. deklariert `firma.ch`, E-Mail `hr.firma.ch`). Die
 * umgekehrte Richtung (E-Mail auf der übergeordneten Domain) gilt bewusst NICHT
 * als Match. Beide Argumente müssen bereits normalisiert sein.
 */
export function domainsMatch(
  declared: string | null,
  candidate: string | null,
): boolean {
  if (!declared || !candidate) return false;
  if (declared === candidate) return true;
  return candidate.endsWith("." + declared);
}
