import { createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * zeugnio – Zufallswerte und HMAC für die eigene Anmeldung
 * ----------------------------------------------------------------------------
 * Drei Arten von Geheimnissen entstehen hier:
 *
 *   Link-Token     32 Zufallsbytes, base64url  → steht im Link der Mail
 *   Code           6 Ziffern                   → steht in derselben Mail
 *   Sitzung        32 Zufallsbytes, base64url  → liegt als Cookie im Browser
 *
 * In die Datenbank kommt keines davon, nur `hmac(...)`: HMAC-SHA256 mit
 * ZEUGNIO_AUTH_SECRET, als Hex-Text. Warum kein einfacher SHA-256: Ein Code hat
 * nur eine Million Möglichkeiten. Aus einem gestohlenen Datenbankauszug wären
 * die in Sekunden durchgerechnet. Mit einem Geheimnis, das nur der Server
 * kennt, geht das nicht (Plan § 6.1).
 *
 * Jede Art hat einen eigenen Zweck-Präfix im HMAC. So kann ein Wert der einen
 * Art nie als Wert einer anderen durchgehen, auch wenn jemand Tabellen
 * vertauscht. Der Code wird zusätzlich an die Adresse gebunden.
 *
 * Verglichen wird nicht hier, sondern in der Datenbank, und zwar HMAC gegen
 * HMAC. Ein Zeitunterschied beim Vergleich verriete darum nur etwas über einen
 * HMAC-Wert, aus dem sich kein Code zurückrechnen lässt.
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:auth` das Modul laden kann.
 */

export type HmacPurpose = "link" | "code" | "session" | "ratelimit";

/** 32 Zufallsbytes als base64url (43 Zeichen, URL- und Cookie-tauglich). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 6 Ziffern, gleichverteilt, mit führenden Nullen («004711»). */
export function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Form eines Tokens aus newToken(). Alles andere wird gar nicht erst nachgeschlagen. */
export function isTokenShape(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Form eines Codes aus newCode(). */
export function isCodeShape(value: string | undefined | null): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

/** Adresse so, wie sie gespeichert und verglichen wird. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Grobe Prüfung; die Wahrheit ist, ob die Mail ankommt. */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * HMAC-SHA256(secret, purpose ‖ 0x00 ‖ value) als Hex. Das Nullbyte trennt
 * Präfix und Wert eindeutig.
 */
export function hmac(secret: string, purpose: HmacPurpose, value: string): string {
  if (!secret) throw new Error("hmac: Geheimnis fehlt");
  return createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("hex");
}

/** HMAC eines Codes, gebunden an die Adresse: derselbe Code für eine andere Adresse ergibt einen anderen Wert. */
export function codeHmac(secret: string, email: string, code: string): string {
  return hmac(secret, "code", `${normalizeEmail(email)}\0${code}`);
}

/**
 * Adresse für die Anzeige auf /auth/link, teilweise verdeckt:
 * «anna.muster@firma.ch» → «ann•••r@firma.ch».
 *
 * Zweck (Login-CSRF): Schickt jemand einer Person den Link zum EIGENEN Konto,
 * soll diese vor dem Klick sehen, dass es nicht ihre Adresse ist. Darum stehen
 * Anfang UND Ende des lokalen Teils da und die ganze Domain: «anna.muster»
 * und «andrea.meier» sehen mit nur zwei Zeichen gleich aus («an•••»), mit drei
 * vorne und einem hinten nicht mehr («ann•••r», «and•••r»). Ganz ausgeschrieben stünde die Adresse
 * sonst auf jeder Seite, die ein Linkscanner abruft, darum bleibt die Mitte
 * verdeckt.
 *
 * Länge des lokalen Teils → sichtbar: 1–2 → erstes Zeichen; 3 → erstes und
 * letztes; 4 → zwei vorne, eins hinten; ab 5 → drei vorne, eins hinten. Ab
 * zwei Zeichen bleibt so immer mindestens eines verdeckt.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 2) return `${local.slice(0, 1)}•••@${domain}`;
  const head = Math.min(3, local.length - 2);
  return `${local.slice(0, head)}•••${local.slice(-1)}@${domain}`;
}

/**
 * Muss /auth/link vor dem Einlösen ausdrücklich nachfragen? Ja, wenn dieser
 * Browser schon angemeldet ist und der Link zu einem ANDEREN Konto gehört.
 *
 * Ein Link wechselt dann still das Konto: Die Person arbeitet danach im
 * fremden Konto weiter und legt ihre Zeugnisse dort ab. Genau das ist der Weg
 * eines untergeschobenen Anmeldelinks. Darum zeigt die Seite in diesem Fall
 * beide Konten und verlangt eine Bestätigung, und POST /api/auth/link löst
 * ohne sie nicht ein.
 *
 * Ist die Adresse der laufenden Sitzung unbekannt, gilt das als «anderes
 * Konto»: lieber einmal zu viel fragen.
 */
export function needsSwitchConfirm(
  current: { email?: string | null } | null | undefined,
  linkEmail: string,
): boolean {
  if (!current) return false;
  if (!current.email) return true;
  return normalizeEmail(current.email) !== normalizeEmail(linkEmail);
}

/** Wert des Bestätigungsfelds auf /auth/link beim Kontowechsel. */
export const SWITCH_CONFIRM_VALUE = "ja";
