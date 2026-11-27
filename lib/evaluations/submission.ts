/**
 * Eingaben der vorgesetzten Person (Token-Link) prüfen und das Ergebnis der
 * Abgabe in eine HTTP-Antwort übersetzen.
 *
 * Sicherheitstest 24.11.2026, Befund T7. Die Route `app/api/evaluations/submit`
 * ist öffentlich: Wer einen gültigen Link hat, kann beliebiges JSON schicken.
 * Darum gilt ein striktes Schema, bevor irgendetwas die Datenbank erreicht:
 *
 *   - `token` ist ein String, `evaluations` eine Liste mit 1 bis
 *     `MAX_EVALUATIONS` Einträgen (so viele Eigenschaften hat der Katalog).
 *   - `category` muss eine Eigenschaft aus dem Skill-Katalog sein, jede nur
 *     einmal. `subcategory` (das Thema) legt der Server aus dem Katalog fest;
 *     schickt der Browser ein anderes Thema mit, ist die Anfrage ungültig.
 *   - `rating` ist einer der vier Skalenwerte.
 *   - `free_text` ist leer oder ein String bis `MAX_FREE_TEXT` Zeichen.
 *   - Unbekannte Felder werden verworfen, nicht gespeichert.
 *
 * Die Datenbankfunktion aus 043 prüft dieselben Grenzen ein zweites Mal.
 */
import { SKILLS } from "@/lib/phrases/skills";

export const RATING_VALUES = ["sehr_gut", "gut", "genuegend", "ungenuegend"] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

/** Höchstens so viele Einträge, wie der Katalog Eigenschaften hat. */
export const MAX_EVALUATIONS = SKILLS.length;

/**
 * Obergrenze pro Anmerkung. Die Anmerkung geht 1:1 ins Zeugnis, das auf eine
 * Seite zielt (12 bis 13 Sätze). 1000 Zeichen sind rund sechs Sätze und damit
 * weit über dem, was eine Anmerkung sinnvoll braucht.
 */
export const MAX_FREE_TEXT = 1000;

/**
 * Obergrenze für den ganzen Request-Body in Zeichen. Ein voller Katalog mit
 * ausgeschöpften Anmerkungen braucht rund 40 000 Zeichen.
 */
export const MAX_BODY_CHARS = 100_000;

export interface ValidEvaluation {
  category: string;
  subcategory: string;
  rating: RatingValue;
  free_text: string | null;
}

export type ParseResult =
  | { ok: true; token: string; evaluations: ValidEvaluation[] }
  | { ok: false; error: string };

export type ListParseResult =
  | { ok: true; evaluations: ValidEvaluation[] }
  | { ok: false; error: string };

const THEME_BY_SKILL = new Map(SKILLS.map((s) => [s.key, s.theme]));
const RATING_SET = new Set<string>(RATING_VALUES);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const INVALID = "Ungültige Anfrage";

/**
 * Prüft den bereits geparsten JSON-Body der Abgabe über den Einladungslink.
 * Gibt nur die erlaubten Felder zurück; alles andere wird verworfen. Die
 * Fehlermeldungen nennen keine Interna.
 */
export function parseSubmission(body: unknown): ParseResult {
  if (!isPlainObject(body)) return { ok: false, error: INVALID };

  const { token, evaluations } = body;
  if (typeof token !== "string" || token.length === 0 || token.length > 200) {
    return { ok: false, error: INVALID };
  }
  const list = parseEvaluationList(evaluations);
  return list.ok ? { ok: true, token, evaluations: list.evaluations } : list;
}

/**
 * Prüft den Body der Selbstbeurteilung (`{ evaluations }`, angemeldete
 * Personalabteilung, app/api/certificates/[id]/evaluate-self). Dieselben
 * Regeln wie beim Einladungslink, nur ohne Token.
 */
export function parseSelfEvaluation(body: unknown): ListParseResult {
  if (!isPlainObject(body)) return { ok: false, error: INVALID };
  return parseEvaluationList(body.evaluations);
}

/** Die Liste der Beurteilungen, gemeinsam für beide Wege. */
export function parseEvaluationList(evaluations: unknown): ListParseResult {
  if (!Array.isArray(evaluations)) return { ok: false, error: INVALID };
  if (evaluations.length === 0) {
    return { ok: false, error: "Bitte mindestens eine Eigenschaft beurteilen." };
  }
  if (evaluations.length > MAX_EVALUATIONS) return { ok: false, error: INVALID };

  const seen = new Set<string>();
  const out: ValidEvaluation[] = [];

  for (const item of evaluations) {
    if (!isPlainObject(item)) return { ok: false, error: INVALID };

    const { category, subcategory, rating, free_text } = item;

    if (typeof category !== "string") return { ok: false, error: INVALID };
    const theme = THEME_BY_SKILL.get(category);
    if (!theme) return { ok: false, error: INVALID };
    if (seen.has(category)) return { ok: false, error: INVALID };
    seen.add(category);

    if (subcategory !== undefined && subcategory !== null && subcategory !== theme) {
      return { ok: false, error: INVALID };
    }

    if (typeof rating !== "string" || !RATING_SET.has(rating)) {
      return { ok: false, error: INVALID };
    }

    let text: string | null = null;
    if (free_text !== undefined && free_text !== null) {
      if (typeof free_text !== "string") return { ok: false, error: INVALID };
      // NUL kann Postgres in text nicht speichern; es kommt aus keinem Formular.
      if (free_text.includes("\u0000")) return { ok: false, error: INVALID };
      const trimmed = free_text.trim();
      if (trimmed.length > MAX_FREE_TEXT) {
        return {
          ok: false,
          error: `Eine Anmerkung darf höchstens ${MAX_FREE_TEXT} Zeichen lang sein.`,
        };
      }
      text = trimmed.length > 0 ? trimmed : null;
    }

    out.push({
      category,
      subcategory: theme,
      rating: rating as RatingValue,
      free_text: text,
    });
  }

  return { ok: true, evaluations: out };
}

/**
 * Liest einen JSON-Body mit Grössengrenze (`MAX_BODY_CHARS`): erst die
 * angekündigte Länge, dann die tatsächliche. Bei `ok: false` war der Body zu
 * gross (`tooLarge`) oder kein gültiges JSON.
 */
export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; tooLarge: boolean }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS * 4) {
    return { ok: false, tooLarge: true };
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return { ok: false, tooLarge: true };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

/** Rückgabewerte von `zeugnio_submit_manager_evaluation` (Migration 043). */
export type SubmitCode =
  | "ok"
  | "not_found"
  | "expired"
  | "already_submitted"
  | "locked"
  | "invalid";

/** Allgemeine Meldung, wenn intern etwas schiefgeht. Details nur ins Server-Log. */
export const GENERIC_SUBMIT_ERROR =
  "Die Beurteilung konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.";

/**
 * Übersetzt das Ergebnis der Datenbankfunktion in Status und Meldung. Ein
 * unbekannter Wert gilt als interner Fehler.
 */
export function submitCodeResponse(code: unknown): { status: number; body: Record<string, unknown> } {
  switch (code) {
    case "ok":
      return { status: 200, body: { ok: true } };
    case "not_found":
      return { status: 404, body: { error: "Einladung nicht gefunden" } };
    case "expired":
      return { status: 410, body: { error: "Einladung abgelaufen" } };
    case "already_submitted":
      return { status: 409, body: { error: "Beurteilung wurde bereits abgegeben" } };
    case "locked":
      return {
        status: 409,
        body: {
          error: "Das Zeugnis ist bereits abgeschlossen. Eine Beurteilung ist nicht mehr nötig.",
        },
      };
    case "invalid":
      return { status: 400, body: { error: INVALID } };
    default:
      return { status: 500, body: { error: GENERIC_SUBMIT_ERROR } };
  }
}
