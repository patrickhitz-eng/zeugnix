/**
 * Welche Beurteilungen eines Zeugnisses gelten.
 *
 * Bis zum Sicherheitstest vom 24.11.2026 (Befund T7) löschte jede Abgabe alle
 * Beurteilungen des Zeugnisses, auch die Selbstbeurteilung der
 * Personalabteilung und Abgaben über andere Einladungen. Pro Zeugnis lag darum
 * immer genau ein Satz vor, und der Generator nahm einfach alle Zeilen.
 *
 * Seit Migration 043 ersetzt die Abgabe über einen Link nur noch die Einträge
 * der eigenen Einladung. Es können also mehrere Sätze nebeneinander liegen:
 * einer pro Einladung (invitation_id) und höchstens einer ohne Einladung (die
 * Selbstbeurteilung, die beim Speichern weiterhin alles ersetzt).
 *
 * Es gilt wie bisher der jüngste Satz. Am sichtbaren Ergebnis ändert sich
 * nichts: Was zuletzt abgegeben wurde, bestimmt den Text. Ältere Sätze bleiben
 * aber in der Datenbank, statt von einem anonymen Aufruf gelöscht zu werden.
 * Sie verschwinden mit dem Zeugnis (on delete cascade).
 */

export interface EvaluationRowLike {
  invitation_id?: string | null;
  created_at?: string | null;
}

/** Schlüssel eines Satzes: die Einladung, oder «self» ohne Einladung. */
function setKey(row: EvaluationRowLike): string {
  return row.invitation_id ? `inv:${row.invitation_id}` : "self";
}

function timeOf(row: EvaluationRowLike): number {
  const t = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Gibt die Zeilen des jüngsten Satzes zurück, in der ursprünglichen
 * Reihenfolge. Jünger heisst: die späteste `created_at` im Satz. Bei Gleichstand
 * gewinnt der Satz, der in der Eingabe zuletzt steht.
 */
export function latestEvaluationSet<T extends EvaluationRowLike>(rows: readonly T[] | null | undefined): T[] {
  if (!rows || rows.length === 0) return [];

  const newest = new Map<string, number>();
  for (const row of rows) {
    const key = setKey(row);
    const t = timeOf(row);
    if (!newest.has(key) || t >= newest.get(key)!) newest.set(key, t);
  }
  if (newest.size === 1) return [...rows];

  let bestKey = "";
  let bestTime = -Infinity;
  for (const row of rows) {
    const key = setKey(row);
    const t = newest.get(key)!;
    if (t >= bestTime) {
      bestTime = t;
      bestKey = key;
    }
  }
  return rows.filter((row) => setKey(row) === bestKey);
}
