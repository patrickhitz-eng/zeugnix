/**
 * Tests für die uncodierten Bausteine «genügend»/«ungenügend» (Migration 037).
 *
 *   npm run test:bausteine   (bzw. npx tsx scripts/test-bausteine-037.ts)
 *
 * Geprüft wird der Stand NACH der Migration, also 009 mit den Änderungen aus 037:
 *   1. Jede Änderung trifft einen Baustein, den es in 009 gibt (Präsens und Präteritum).
 *   2. Kein Text der Stufen «genügend»/«ungenügend» enthält ein Codewort.
 *   3. Platzhalter sind gültig: nur bekannte {x}, Gender-Tokens mit genau drei
 *      nicht leeren Formen, am Satzanfang grossgeschrieben.
 *   4. Präsens und Präteritum enthalten dieselben Platzhalter.
 *   5. Kein «ß», keine doppelten Leerzeichen, jeder Text endet mit einem Punkt.
 *   6. Kein neuer Text ist gleich einem Text der Stufen «gut»/«sehr gut» derselben
 *      Fähigkeit, und kein Präsens-Text ist gleich dem Präteritum-Text.
 *   7. Eingespielte Migrationen (037 …) sind unverändert (SHA-256). Eine offene
 *      Folgemigration passt zur JSON-Quelle, und 009 + eingespielt + offen ergibt
 *      genau den Soll-Stand. Die Review-Datei ist aktuell.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CODEWOERTER,
  PLATZHALTER,
  REVIEW_PATH,
  SUPABASE_DIR,
  istStand,
  keyOf,
  loadAenderungen,
  loadEingespielt,
  offeneDateien,
  offeneZeilen,
  parseMigration,
  parseSeed,
  renderFolgemigration,
  renderReview,
  sha256Datei,
  sollStand,
  tokens,
  type SeedRow,
} from "./bausteine-037-lib";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
    failed++;
  }
}

const seed = parseSeed();
const aenderungen = loadAenderungen();

// Selbsttest der Prüfregeln: Sie müssen die alten Codesätze tatsächlich finden.
const hatCode = (t: string) => CODEWOERTER.some((c) => c.re.test(t));
ok("Codeliste erkennt «bemüht»", hatCode("Zu ihren Eigenschaften gehört, dass sie sich um ein gutes Verhältnis bemüht."));
ok("Codeliste erkennt «meist»", hatCode("Dabei erreicht er meist viele vereinbarte Ziele."));
ok("Codeliste erkennt «Möglichkeiten entsprechend»", hatCode("Er arbeitet seinen Möglichkeiten entsprechend selbständig."));
ok("Codeliste lässt «meistert» durch", !hatCode("Sie meistert schwierige Situationen."));

console.log("\n1. Jede Änderung trifft einen bestehenden Baustein");
ok("009 enthält 854 Bausteine", seed.length === 854, `waren ${seed.length}`);
const seedIndex = new Map(seed.map((r) => [`${keyOf(r)}|${r.tempus}`, r]));
for (const a of aenderungen) {
  ok(`${a.key}: Stufe ist genügend/ungenügend`, a.rating === "genuegend" || a.rating === "ungenuegend");
  for (const t of ["praesens", "praeteritum"] as const) {
    ok(`${a.key} (${t}) existiert in 009`, seedIndex.has(`${a.key}|${t}`));
  }
  ok(`${a.key}: Begründung vorhanden`, a.warum.trim().length > 10);
}
ok("keine doppelten Schlüssel", new Set(aenderungen.map((a) => a.key)).size === aenderungen.length);

// Stand nach der Migration
const neuIndex = new Map<string, string>();
for (const a of aenderungen) {
  neuIndex.set(`${a.key}|praesens`, a.praesens);
  neuIndex.set(`${a.key}|praeteritum`, a.praeteritum);
}
const nachher: SeedRow[] = seed.map((r) => ({ ...r, text: neuIndex.get(`${keyOf(r)}|${r.tempus}`) ?? r.text }));
const unten = nachher.filter((r) => r.rating === "genuegend" || r.rating === "ungenuegend");

console.log("\n2. Keine Codewörter in «genügend»/«ungenügend»");
for (const r of unten) {
  for (const c of CODEWOERTER) {
    const m = c.re.exec(r.text);
    ok(`${keyOf(r)} (${r.tempus}) ohne Code`, !m, m ? `«${m[0]}» (${c.warum}): ${r.text}` : "");
  }
}

console.log("\n3. Platzhalter gültig");
for (const r of unten) {
  const id = `${keyOf(r)} (${r.tempus})`;
  const { gender, simple } = tokens(r.text);
  for (const s of simple) ok(`${id}: {${s}} ist bekannt`, PLATZHALTER.has(s));
  for (const g of gender) {
    const teile = g.split("|");
    ok(`${id}: {{${g}}} hat drei Formen`, teile.length === 3 && teile.every((t) => t.trim().length > 0));
  }
  const rest = r.text.replace(/\{\{[^{}]*\}\}/g, "").replace(/\{[^{}]*\}/g, "");
  ok(`${id}: keine losen Klammern`, !/[{}]/.test(rest));
  // Satzanfang: Token muss grossgeschrieben sein
  for (const m of r.text.matchAll(/(?:^|[.!?] )\{\{([^{}|]*)\|/g)) {
    ok(`${id}: Token am Satzanfang gross`, /^[A-ZÄÖÜ]/.test(m[1]), `«${m[1]}»`);
  }
}

console.log("\n4. Präsens und Präteritum passen zusammen");
for (const a of aenderungen) {
  const p = tokens(a.praesens);
  const t = tokens(a.praeteritum);
  ok(`${a.key}: gleiche Gender-Tokens`, JSON.stringify(p.gender) === JSON.stringify(t.gender));
  ok(`${a.key}: gleiche Platzhalter`, JSON.stringify(p.simple) === JSON.stringify(t.simple));
  ok(`${a.key}: Präteritum ist nicht gleich Präsens`, a.praesens !== a.praeteritum);
}

console.log("\n5. Schreibweise");
for (const a of aenderungen) {
  for (const [t, text] of [["praesens", a.praesens], ["praeteritum", a.praeteritum]] as const) {
    const id = `${a.key} (${t})`;
    ok(`${id}: kein ß`, !text.includes("ß"));
    ok(`${id}: keine doppelten Leerzeichen`, !/ {2}/.test(text) && text === text.trim());
    ok(`${id}: endet mit Punkt`, text.endsWith("."));
    ok(`${id}: beginnt gross`, /^(\{\{[A-ZÄÖÜ]|\{vorname\}|[A-ZÄÖÜ])/.test(text));
  }
}

console.log("\n6. Stufen bleiben unterscheidbar");
const oben = new Set(nachher.filter((r) => r.rating === "gut" || r.rating === "sehr_gut").map((r) => `${r.category}|${r.tempus}|${r.text}`));
for (const a of aenderungen) {
  ok(`${a.key}: nicht gleich «gut»/«sehr gut»`, !oben.has(`${a.category}|praesens|${a.praesens}`));
}

console.log("\n7. Eingespielte Migrationen eingefroren, offene aktuell");
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const eingespielt = loadEingespielt();
ok("037 ist als eingespielt eingetragen", eingespielt[0]?.datei === "037_bausteine_ungenuegend.sql");
for (const e of eingespielt) {
  const file = path.join(SUPABASE_DIR, e.datei);
  ok(`${e.datei} existiert`, existsSync(file));
  if (!existsSync(file)) continue;
  ok(
    `${e.datei} unverändert seit dem Einspielen (${e.eingespielt})`,
    sha256Datei(file) === e.sha256,
    "Eine eingespielte Migration darf sich nicht ändern. Korrekturen gehören in eine Folgemigration (npm run bausteine:build).",
  );
}
ok("037 enthält 292 Zeilen", parseMigration(path.join(SUPABASE_DIR, "037_bausteine_ungenuegend.sql")).length === 292);

// Die Kette 009 + eingespielt + offen muss genau den Soll-Stand der JSON-Quelle ergeben.
const offen = offeneZeilen(seed, aenderungen, eingespielt);
const dateien = offeneDateien(eingespielt);
ok("höchstens eine offene Bausteine-Migration", dateien.length <= 1, dateien.join(", "));
if (offen.length === 0) {
  ok("keine offene Folgemigration, wenn nichts offen ist", dateien.length === 0, `veraltet: ${dateien.join(", ")} (npm run bausteine:build löscht sie)`);
} else {
  ok("offene Änderungen haben eine Folgemigration", dateien.length === 1, "neu erzeugen: npm run bausteine:build");
  if (dateien.length === 1) {
    const datei = dateien[0];
    ok(
      `supabase/${datei} passt zur JSON-Quelle`,
      norm(readFileSync(path.join(SUPABASE_DIR, datei), "utf8")) === renderFolgemigration(datei, offen),
      "neu erzeugen: npm run bausteine:build",
    );
    const kette = istStand(seed, [...eingespielt, { datei, sha256: "", eingespielt: "offen" }]);
    const soll = sollStand(seed, aenderungen);
    const abweichend = [...soll].filter(([k, t]) => kette.get(k) !== t).map(([k]) => k);
    ok("009 + eingespielt + offen ergibt den Soll-Stand", abweichend.length === 0, abweichend.slice(0, 5).join(", "));
  }
}
ok(
  "docs/bausteine-ungenuegend-review.md passt zur JSON-Quelle",
  norm(readFileSync(REVIEW_PATH, "utf8")) === renderReview(aenderungen, seed),
  "neu erzeugen: npm run bausteine:build",
);

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
