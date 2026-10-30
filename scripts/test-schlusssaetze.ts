/**
 * Tests für den Schlusssatz-Katalog und den Tausch im Zeugnistext.
 *
 *   npm run test:schlusssaetze   (bzw. npx tsx scripts/test-schlusssaetze.ts)
 *
 * Kernanforderung (Silvan, 30.10.2026): Jede wählbare Kombination ergibt einen
 * eigenen Satz, und ein Wechsel einer einzelnen Auswahl ändert den Satz immer.
 * Weil alle Kombinationen paarweise verschieden sein müssen, deckt die
 * Eindeutigkeitsprüfung auch jeden Einzelwechsel ab.
 */

import {
  pickSchlusssatz,
  schlusssatzPreview,
  type Grund,
  type SchlusssatzParams,
  type SchlusssatzSubject,
  type Wertschaetzung,
  type ZwischenAnlass,
} from "../lib/phrases/schlusssaetze";
import { tauscheImDoc, tauscheImText } from "../lib/phrases/schlusssatz-tausch";
import type { TiptapNode } from "../lib/certificate/tiptap-plaintext";

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

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `erwartet ${e}\n      war      ${a}`);
}

const GRUENDE: Grund[] = ["wunsch_an", "wunsch_ag", "einvernehmen"];
const GRADE: Wertschaetzung[] = ["standard", "wertschaetzender", "top"];
const ANLAESSE: ZwischenAnlass[] = ["wunsch", "vorgesetztenwechsel", "interner_wechsel", "reorganisation"];
const PERSONEN: SchlusssatzSubject[] = [
  { firstName: "Max", lastName: "Muster", gender: "m" },
  { firstName: "Anna", lastName: "Muster", gender: "f" },
  { firstName: "Kim", lastName: "Muster", gender: "d" },
];

function schlussKombis(): SchlusssatzParams[] {
  const out: SchlusssatzParams[] = [];
  for (const austrittsgrund of GRUENDE)
    for (const wertschaetzung of GRADE)
      for (const optinReorg of [false, true])
        for (const optinBedauern of [false, true])
          out.push({ zeugnisTyp: "schluss", austrittsgrund, wertschaetzung, optinReorg, optinBedauern });
  return out;
}

function zwischenKombis(): SchlusssatzParams[] {
  const out: SchlusssatzParams[] = [];
  for (const anlass of ANLAESSE)
    for (const wertschaetzung of GRADE)
      out.push({
        zeugnisTyp: "zwischen",
        wertschaetzung,
        optinVorgesetztenwechsel: anlass === "vorgesetztenwechsel",
        optinInternerWechsel: anlass === "interner_wechsel",
        optinReorg: anlass === "reorganisation",
      });
  return out;
}

function pruefeGruppe(titel: string, kombis: SchlusssatzParams[]) {
  console.log(`\n=== ${titel}: ${kombis.length} Kombinationen ===`);
  for (const person of PERSONEN) {
    const saetze = kombis.map((k) => schlusssatzPreview(k, person) ?? "");
    for (const [i, s] of saetze.entries()) {
      const k = JSON.stringify(kombis[i]);
      ok(`aufgelöst (${person.gender}) ${k}`, !/[{}]/.test(s), s);
      ok(`kein ß (${person.gender}) ${k}`, !s.includes("ß"), s);
      ok(`keine Doppelleerzeichen (${person.gender}) ${k}`, !/\s{2,}/.test(s), s);
      ok(`endet mit Punkt (${person.gender}) ${k}`, s.endsWith("."), s);
    }
    const doppelt = saetze.filter((s, i) => saetze.indexOf(s) !== i);
    ok(`alle verschieden (${person.gender})`, doppelt.length === 0, doppelt.join("\n      "));
  }
}

pruefeGruppe("Schlusszeugnis", schlussKombis());
pruefeGruppe("Zwischenzeugnis", zwischenKombis());

console.log("\n=== Inhaltliche Regeln ===");
const anna = PERSONEN[1];
for (const k of schlussKombis().filter((k) => k.wertschaetzung === "top"))
  ok(`Top im Schlusszeugnis enthält ein Bedauern ${JSON.stringify(k)}`, /bedauern/i.test(pickSchlusssatz(k)!));
for (const k of zwischenKombis())
  ok(`Zwischenzeugnis ohne Bedauern ${JSON.stringify(k)}`, !/bedauern/i.test(pickSchlusssatz(k)!));

// Bedauern ergänzt, statt zu ersetzen: der Grundsatz bleibt erhalten.
for (const k of schlussKombis().filter((k) => !k.optinBedauern)) {
  const ohne = pickSchlusssatz(k)!;
  const mit = pickSchlusssatz({ ...k, optinBedauern: true })!;
  ok(`Bedauern ist Zusatz ${JSON.stringify(k)}`, mit.includes(ohne) || mit.includes(ohne.split(". ").pop()!), `${ohne}\n      ${mit}`);
}

// Christophs bisherige Sätze bleiben unverändert.
eq(
  "Standard, Wunsch MA (Christoph)",
  schlusssatzPreview({ zeugnisTyp: "schluss", austrittsgrund: "wunsch_an", wertschaetzung: "standard" }, anna),
  "Wir danken ihr für die geleistete Arbeit und wünschen ihr für die Zukunft alles Gute und weiterhin viel Erfolg.",
);
eq(
  "Zwischen, Vorgesetztenwechsel Standard (Christoph)",
  schlusssatzPreview({ zeugnisTyp: "zwischen", wertschaetzung: "standard", optinVorgesetztenwechsel: true }, anna),
  "Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken Anna Muster für die bisherige sehr wertvolle Unterstützung bestens und hoffen, noch lange auf ihre geschätzte Mitarbeit zählen zu dürfen.",
);

// Top-Sätze wie auf den Folien vom 30.10.2026.
eq(
  "Top, Wunsch MA",
  schlusssatzPreview({ zeugnisTyp: "schluss", austrittsgrund: "wunsch_an", wertschaetzung: "top" }, anna),
  "Wir bedauern ihren Entscheid sehr, danken ihr herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ihr für ihre berufliche und private Zukunft alles Gute und weiterhin viel Erfolg.",
);
eq(
  "Top, Reorganisation Arbeitgeber",
  schlusssatzPreview({ zeugnisTyp: "schluss", austrittsgrund: "wunsch_ag", wertschaetzung: "top", optinReorg: true }, anna),
  "Das Arbeitsverhältnis endet infolge einer Reorganisation, nicht aus Gründen in ihrer Person oder Leistung. Wir bedauern dies sehr, danken ihr herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und empfehlen sie uneingeschränkt weiter. Für ihre berufliche und private Zukunft wünschen wir ihr alles Gute und weiterhin viel Erfolg.",
);
eq(
  "Top + Bedauern hängt den Abschluss an",
  schlusssatzPreview({ zeugnisTyp: "schluss", austrittsgrund: "einvernehmen", wertschaetzung: "top", optinBedauern: true }, PERSONEN[0]),
  "Wir bedauern sein Ausscheiden sehr, danken ihm herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ihm für seine berufliche und private Zukunft alles Gute und weiterhin viel Erfolg. Mit ihm verlieren wir eine hervorragende Fachkraft.",
);

console.log("\n=== Tausch im Text ===");
eq("Text: ersetzt", tauscheImText("A\n\nAlt.\n\nZürich", "Alt.", "Neu."), "A\n\nNeu.\n\nZürich");
eq("Text: nicht gefunden", tauscheImText("A\n\nAnders.", "Alt.", "Neu."), null);
eq("Text: nur erstes Vorkommen", tauscheImText("Alt. Alt.", "Alt.", "Neu."), "Neu. Alt.");

const fett = [{ type: "bold" }];
const doc: TiptapNode = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Einleitung." }] },
    { type: "paragraph", content: [{ type: "text", text: "Alter Satz.", marks: fett }] },
  ],
};
const neuDoc = tauscheImDoc(doc, "Alter Satz.", "Neuer Satz.");
eq("Doc: ersetzt und behält Fett", neuDoc?.content?.[1], {
  type: "paragraph",
  content: [{ type: "text", text: "Neuer Satz.", marks: fett }],
});
eq("Doc: Original unverändert", doc.content?.[1].content?.[0].text, "Alter Satz.");

const geteilt: TiptapNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Alter ", marks: fett },
        { type: "text", text: "Satz." },
      ],
    },
  ],
};
eq("Doc: Satz über zwei Knoten", tauscheImDoc(geteilt, "Alter Satz.", "Neuer Satz.")?.content?.[0], {
  type: "paragraph",
  content: [{ type: "text", text: "Neuer Satz.", marks: fett }],
});
eq("Doc: nicht gefunden", tauscheImDoc(doc, "Gibt es nicht.", "Neu."), null);

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
if (failed > 0) process.exit(1);
