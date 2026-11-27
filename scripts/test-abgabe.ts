/**
 * Tests für die gehärtete Abgabe der vorgesetzten Person (Sicherheitstest
 * 24.11.2026, T7 und T8).
 *
 *   npm run test:abgabe
 *
 * Prüft ohne Datenbank:
 *   1. das Schema (lib/evaluations/submission.ts): Typen, Katalog, Skala,
 *      Längen, Anzahl, Duplikate, verworfene Zusatzfelder;
 *   2. die Übersetzung der Rückgabewerte der Datenbankfunktion (043);
 *   3. die Auswahl des jüngsten Beurteilungssatzes (lib/evaluations/latest-set.ts),
 *      seit die Abgabe nur noch die eigenen Einträge ersetzt;
 *   4. als Regressionsschutz am Quelltext: keine Datenbank-Fehlertexte an den
 *      Browser, nur nötige Felder auf der Seite für Vorgesetzte.
 *
 * Die Datenbankfunktion selbst (nur eigene Einträge ersetzen, Sperre,
 * Gleichzeitigkeit) prüft scripts/test-abgabe.sql auf einer Wegwerf-Datenbank.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SKILLS } from "../lib/phrases/skills";
import {
  GENERIC_SUBMIT_ERROR,
  MAX_EVALUATIONS,
  MAX_FREE_TEXT,
  parseSubmission,
  submitCodeResponse,
} from "../lib/evaluations/submission";
import { latestEvaluationSet } from "../lib/evaluations/latest-set";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

const TOKEN = "a".repeat(43);
const skill = SKILLS[0];
const skill2 = SKILLS[1];
const good = { category: skill.key, subcategory: skill.theme, rating: "gut", free_text: null };

// ------------------------------------------------------------------ 1. Schema
console.log("Schema:");
{
  const r = parseSubmission({ token: TOKEN, evaluations: [good] });
  check("gültige Abgabe wird angenommen", r.ok);
  if (r.ok) {
    check("Thema kommt aus dem Katalog", r.evaluations[0].subcategory === skill.theme);
    check("Token unverändert", r.token === TOKEN);
  }
}
{
  const r = parseSubmission({ token: TOKEN, evaluations: [{ category: skill.key, rating: "sehr_gut" }] });
  check("ohne subcategory: Thema wird ergänzt", r.ok && r.evaluations[0].subcategory === skill.theme);
}
{
  const r = parseSubmission({
    token: TOKEN,
    evaluations: [{ ...good, selected_phrase_id: "x", certificate_id: "fremd", invitation_id: "fremd", submitted_by_email: "x" }],
    extra: 1,
  });
  check("Zusatzfelder werden verworfen", r.ok && Object.keys(r.evaluations[0]).sort().join(",") === "category,free_text,rating,subcategory");
}
check("Body kein Objekt → abgelehnt", !parseSubmission(null).ok && !parseSubmission([]).ok && !parseSubmission("x").ok);
check("Token fehlt → abgelehnt", !parseSubmission({ evaluations: [good] }).ok);
check("Token kein String → abgelehnt", !parseSubmission({ token: 123, evaluations: [good] }).ok);
check("Token überlang → abgelehnt", !parseSubmission({ token: "a".repeat(201), evaluations: [good] }).ok);
check("evaluations kein Array → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: {} }).ok);
check("leere Liste → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [] }).ok);
check(
  "mehr Einträge als der Katalog → abgelehnt",
  !parseSubmission({ token: TOKEN, evaluations: Array.from({ length: MAX_EVALUATIONS + 1 }, () => good) }).ok,
);
{
  const all = SKILLS.map((s) => ({ category: s.key, rating: "gut" }));
  check(`voller Katalog (${all.length}) wird angenommen`, parseSubmission({ token: TOKEN, evaluations: all }).ok);
}
check("doppelte Kategorie → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [good, good] }).ok);
check("unbekannte Kategorie → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [{ ...good, category: "erfunden" }] }).ok);
check("Kategorie kein String → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [{ ...good, category: 1 }] }).ok);
check(
  "Kategorie als geerbte Eigenschaft (toString) → abgelehnt",
  !parseSubmission({ token: TOKEN, evaluations: [{ ...good, category: "toString" }] }).ok,
);
check(
  "falsches Thema → abgelehnt",
  !parseSubmission({ token: TOKEN, evaluations: [{ ...good, subcategory: skill.theme === "fuehrung" ? "x" : "fuehrung" }] }).ok,
);
check("unbekannter Skalenwert → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [{ ...good, rating: "hervorragend" }] }).ok);
check("Skalenwert fehlt → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [{ category: skill.key }] }).ok);
check("Eintrag kein Objekt → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: ["gut"] }).ok);
check("Freitext kein String → abgelehnt", !parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: 5 }] }).ok);
check(
  "Freitext mit NUL → abgelehnt",
  !parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: "a\u0000b" }] }).ok,
);
{
  const exact = parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: "x".repeat(MAX_FREE_TEXT) }] });
  check(`Freitext mit ${MAX_FREE_TEXT} Zeichen angenommen`, exact.ok);
  const over = parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: "x".repeat(MAX_FREE_TEXT + 1) }] });
  check(`Freitext mit ${MAX_FREE_TEXT + 1} Zeichen abgelehnt`, !over.ok);
  check("Meldung nennt die Grenze", !over.ok && over.error.includes(String(MAX_FREE_TEXT)));
}
{
  const r = parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: "  Projekt X  " }] });
  check("Freitext wird getrimmt", r.ok && r.evaluations[0].free_text === "Projekt X");
  const blank = parseSubmission({ token: TOKEN, evaluations: [{ ...good, free_text: "   " }] });
  check("leerer Freitext wird null", blank.ok && blank.evaluations[0].free_text === null);
}
{
  const r = parseSubmission({ token: TOKEN, evaluations: [good, { category: skill2.key, rating: "genuegend" }] });
  check("Reihenfolge bleibt erhalten", r.ok && r.evaluations.map((e) => e.category).join() === `${skill.key},${skill2.key}`);
}

// -------------------------------------------------------- 2. Rückgabewerte 043
console.log("Rückgabewerte der Abgabefunktion:");
check("ok → 200", submitCodeResponse("ok").status === 200);
check("not_found → 404", submitCodeResponse("not_found").status === 404);
check("expired → 410", submitCodeResponse("expired").status === 410);
check("already_submitted → 409", submitCodeResponse("already_submitted").status === 409);
check("locked → 409", submitCodeResponse("locked").status === 409);
check("invalid → 400", submitCodeResponse("invalid").status === 400);
{
  const r = submitCodeResponse("irgendwas");
  check("unbekannt → 500 mit allgemeiner Meldung", r.status === 500 && r.body.error === GENERIC_SUBMIT_ERROR);
  check("null → 500", submitCodeResponse(null).status === 500);
}

// ------------------------------------------------------- 3. Jüngster Satz
console.log("Jüngster Beurteilungssatz:");
{
  check("leer → leer", latestEvaluationSet([]).length === 0 && latestEvaluationSet(null).length === 0);
  const one = [
    { id: 1, invitation_id: "A", created_at: "2026-11-01T10:00:00Z" },
    { id: 2, invitation_id: "A", created_at: "2026-11-01T10:00:00Z" },
  ];
  check("ein Satz → unverändert", latestEvaluationSet(one).map((r) => r.id).join() === "1,2");

  const mixed = [
    { id: 1, invitation_id: null, created_at: "2026-11-01T10:00:00Z" },
    { id: 2, invitation_id: null, created_at: "2026-11-01T10:00:00Z" },
    { id: 3, invitation_id: "A", created_at: "2026-11-02T09:00:00Z" },
    { id: 4, invitation_id: "A", created_at: "2026-11-02T09:00:00Z" },
    { id: 5, invitation_id: "B", created_at: "2026-10-30T09:00:00Z" },
  ];
  check("Abgabe nach Selbstbeurteilung gilt", latestEvaluationSet(mixed).map((r) => r.id).join() === "3,4");

  const selfLater = [
    { id: 1, invitation_id: "A", created_at: "2026-11-01T10:00:00Z" },
    { id: 2, invitation_id: null, created_at: "2026-11-03T10:00:00Z" },
  ];
  check("spätere Selbstbeurteilung gilt", latestEvaluationSet(selfLater).map((r) => r.id).join() === "2");

  const twoInv = [
    { id: 1, invitation_id: "B", created_at: "2026-11-05T10:00:00Z" },
    { id: 2, invitation_id: "A", created_at: "2026-11-01T10:00:00Z" },
  ];
  check("von zwei Einladungen gilt die jüngere", latestEvaluationSet(twoInv).map((r) => r.id).join() === "1");
}

// --------------------------------------------------- 4. Quelltext-Wächter
console.log("Quelltext:");
{
  const root = process.cwd();
  const route = readFileSync(path.join(root, "app/api/evaluations/submit/route.ts"), "utf8");
  check("Route nutzt die atomare Funktion", route.includes('"zeugnio_submit_manager_evaluation"'));
  check("Route löscht nicht selbst", !/\.delete\(\)/.test(route));
  check(
    "Route gibt keine Fehlertexte an den Browser",
    !/NextResponse\.json\(\s*\{\s*error:\s*[^}]*\.message/.test(route) && !/error:\s*`[^`]*\$\{[^}]*\.message/.test(route),
  );

  const page = readFileSync(path.join(root, "app/(public)/app/invitations/[token]/page.tsx"), "utf8");
  check("Seite lädt kein Geburtsdatum", !page.includes("date_of_birth") && !page.includes("dateOfBirth"));
  check("Seite lädt kein Pensum", !page.includes("employment_percentage") && !page.includes("employmentPercentage"));
  check("Seite lädt keine ganzen Zeilen (*)", !/select\(\s*["'`][^"'`]*\*/.test(page));
  check("Seite gibt die Zeugnis-ID nicht an den Browser", !page.includes("certificateId="));
  check("viewed nur aus pending", /\.eq\("status",\s*"pending"\)/.test(page));

  const sql = readFileSync(path.join(root, "supabase/043_abgabe_atomar.sql"), "utf8");
  check("043 ersetzt nur die eigene Einladung", /delete from public\.evaluations\s+where invitation_id = v_inv\.id;/.test(sql));
  check("043 löscht nicht pro Zeugnis", !/delete from public\.evaluations\s+where certificate_id/.test(sql));
  check("043 nimmt EXECUTE von anon und authenticated", /from anon;/.test(sql) && /from authenticated;/.test(sql));
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
