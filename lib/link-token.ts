import { createHash, randomBytes } from "node:crypto";

/**
 * Token-Links für Personen ohne Konto (Sicherheitstest 24.11.2026, Befund M4).
 *
 * Zwei Links tragen einen Token, der allein den Zugang entscheidet:
 *   - die Einladung an die vorgesetzte Person   /app/invitations/<token>
 *   - die Freigabe der unterzeichnenden Person  /app/signoffs/<token>
 *
 * Der Token geht nur in der Mail (und einmal in der Antwort an HR, als Link
 * zum Weitergeben). In der Datenbank liegt sein SHA-256 in `token_hash`.
 * Nachgeschlagen wird so: Token aus dem Link → hashen → Zeile mit diesem Hash.
 * Wer die Tabelle liest (Mitglied mit «lesen», Sicherung, Auszug), bekommt nur
 * Hashes und kann damit keinen Link bauen.
 *
 * Warum SHA-256 und kein HMAC mit Geheimnis wie bei den Anmelde-Codes
 * (lib/auth/tokens.ts): Der Token hat 256 Bit Zufall. Durchprobieren ist
 * aussichtslos, ein Geheimnis brächte keinen Schutz dazu. Und nur mit einem
 * einfachen Hash kann Migration 040 die schon verschickten Tokens in SQL
 * umrechnen, ohne dass ein Geheimnis in die Datenbank muss. Dasselbe Verfahren
 * wie bei den Team-Einladungen (lib/team/invitations.ts).
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:link-token` das Modul laden
 * kann.
 */

/** Gültige Links sind 14 Tage offen (Einladung und Freigabe). */
export const LINK_TOKEN_DAYS = 14;

/**
 * Was als Token durchgeht: base64url (neu, 43 Zeichen) oder Hex (vor 040, 64
 * Zeichen). Beides passt in diese Zeichenklasse. Alles andere wird gar nicht
 * erst gehasht und nachgeschlagen.
 */
const PLAUSIBLE = /^[A-Za-z0-9_-]{32,128}$/;

export function isPlausibleLinkToken(value: unknown): value is string {
  return typeof value === "string" && PLAUSIBLE.test(value);
}

/**
 * SHA-256 als Hex, über die UTF-8-Bytes des Tokens. Entspricht in SQL
 * `encode(sha256(convert_to(token, 'UTF8')), 'hex')` (Migration 040).
 */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Neuer Token für einen Link, mit dem Hash für die Datenbank. */
export function newLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashLinkToken(token) };
}

/**
 * Hash zum Nachschlagen, oder null, wenn der Wert kein Token sein kann. Die
 * Aufrufer behandeln null wie «nicht gefunden».
 */
export function lookupHash(value: unknown): string | null {
  return isPlausibleLinkToken(value) ? hashLinkToken(value) : null;
}
