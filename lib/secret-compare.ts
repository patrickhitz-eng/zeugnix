import { createHash, timingSafeEqual } from "node:crypto";

/**
 * zeugnio – Geheimnisse zeitkonstant vergleichen
 * ----------------------------------------------------------------------------
 * Ein gewöhnlicher Vergleich (`===`, `!==`) bricht beim ersten abweichenden
 * Zeichen ab. Wer sehr viele Anfragen misst, kann aus der Antwortzeit im
 * Prinzip ablesen, wie viele Zeichen vorne schon stimmen, und sich so Zeichen
 * für Zeichen an ein Geheimnis herantasten. Über das Netz ist das schwer,
 * aber es kostet nichts, es auszuschliessen.
 *
 * `crypto.timingSafeEqual` vergleicht immer alle Bytes, verlangt aber gleich
 * lange Eingaben, und ein Abbruch bei ungleicher Länge verriete die Länge.
 * Darum werden beide Seiten zuerst mit SHA-256 auf 32 Bytes gebracht: Gleich
 * lang sind sie dann immer, und gleich sind die Hashwerte genau dann, wenn die
 * Eingaben gleich sind. Die Längenprüfung danach ist nur noch eine zweite
 * Sicherung und verrät nichts mehr, weil der teure Teil schon gelaufen ist.
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:auth` das Modul laden kann.
 */

/** true genau dann, wenn beide Werte gleich sind. Ein leeres Geheimnis passt nie. */
export function secretEquals(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof given !== "string" || typeof expected !== "string" || expected.length === 0) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b) && given.length === expected.length;
}

/**
 * Prüft einen Kopf `Authorization: Bearer <geheimnis>`. Ist das Geheimnis nicht
 * gesetzt (leer oder nur Leerzeichen), passt nichts: fail closed.
 */
export function hasBearerSecret(authorization: string | null | undefined, secret: string | null | undefined): boolean {
  const s = secret?.trim();
  if (!s) return false;
  return secretEquals(authorization ?? "", `Bearer ${s}`);
}
