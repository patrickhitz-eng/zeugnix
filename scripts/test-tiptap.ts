/**
 * Tests für die Tiptap-Klartext-Projektion (Hash-Invariante).
 *
 * Ausführen:
 *   npm run test:tiptap   (bzw. npx tsx scripts/test-tiptap.ts)
 *
 * Kerngedanke: Der Body wird als Tiptap-JSON gespeichert, der Echtheits-Hash
 * hängt aber nur an der Klartext-Projektion. Formatierung (Marks: bold/color/
 * fontFamily) darf den projizierten Klartext – und damit den Hash – NIE ändern.
 */

import {
  plainTextToTiptap,
  tiptapToPlainText,
  weichtVomGeneriertenAb,
  type TiptapNode,
} from "../lib/certificate/tiptap-plaintext";
import { tiptapToBlocks, blocksToPlainText } from "../lib/certificate/tiptap-runs";
import { canonicalizeForHash, sha256 } from "../lib/hash/canonicalize";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

/** Hängt Marks an JEDEN text-Node (simuliert "Nutzer formatiert alles"). */
function decorateAllText(node: TiptapNode, marks: TiptapNode["marks"]): TiptapNode {
  if (node.type === "text") return { ...node, marks };
  if (!node.content) return node;
  return { ...node, content: node.content.map((c) => decorateAllText(c, marks)) };
}

async function run() {
  console.log("\n=== Tiptap-Projektion Tests ===\n");

  const samples = [
    "Frau Beispiel war vom 01.01.2020 bis 31.12.2024 als Sachbearbeiterin tätig.\n\n" +
      "Zu ihren Hauptaufgaben gehörten:\n\n• Beratung von Geschäftskunden\n• Vorbereitung der Quartalsabschlüsse\n• Schulung neuer Mitarbeitender\n\n" +
      "Sie erfüllte die Aufgaben stets zu unserer vollsten Zufriedenheit.\n\n" +
      "Wir danken Frau Beispiel für die geleistete Arbeit.\n\n" +
      "Zürich, 15.01.2025",
    "Herr Muster war bei uns tätig.\n\nZürich, 30.06.2026",
    "Einzelabsatz ohne Aufgaben.",
  ];

  // ----- Roundtrip: Klartext -> JSON -> Klartext == Original -----
  console.log("Roundtrip (generated_text == projektion(init(generated_text))):");
  samples.forEach((s, i) => {
    const round = tiptapToPlainText(plainTextToTiptap(s));
    assert(`Sample ${i + 1} roundtrip-stabil`, round === s, `\n--- erwartet ---\n${s}\n--- bekommen ---\n${round}`);
  });

  // ----- Bullets bleiben mit "• "-Präfix erhalten -----
  console.log("\nBullets:");
  const bulletDoc = plainTextToTiptap("• A\n• B\n• C");
  assert("Bulletblock wird zu bulletList", bulletDoc.content?.[0]?.type === "bulletList");
  assert(
    "Projektion stellt '• '-Präfix wieder her",
    tiptapToPlainText(bulletDoc) === "• A\n• B\n• C",
  );

  // ----- Mark-Invarianz: Formatierung ändert den Klartext NICHT -----
  console.log("\nMark-Invarianz (Hash-Sicherheit):");
  const base = plainTextToTiptap(samples[0]);
  const plain = tiptapToPlainText(base);

  const bolded = decorateAllText(base, [{ type: "bold" }]);
  assert("bold ändert Klartext nicht", tiptapToPlainText(bolded) === plain);

  const colored = decorateAllText(base, [
    { type: "textStyle", attrs: { color: "#cc0000", fontFamily: "Times-Roman" } },
  ]);
  assert("color+fontFamily ändert Klartext nicht", tiptapToPlainText(colored) === plain);

  const all = decorateAllText(base, [
    { type: "bold" },
    { type: "italic" },
    { type: "underline" },
    { type: "textStyle", attrs: { color: "#0f7a6b", fontFamily: "Courier" } },
  ]);
  assert("bold+italic+underline+style ändert Klartext nicht", tiptapToPlainText(all) === plain);

  // ----- Hash bleibt identisch, wenn nur formatiert wird -----
  console.log("\nHash-Stabilität:");
  const hPlain = await sha256(canonicalizeForHash(tiptapToPlainText(base)));
  const hFmt = await sha256(canonicalizeForHash(tiptapToPlainText(all)));
  assert("Hash(unformatiert) == Hash(voll formatiert)", hPlain === hFmt, `${hPlain} != ${hFmt}`);

  const hChanged = await sha256(
    canonicalizeForHash(tiptapToPlainText(plainTextToTiptap(samples[0] + " zusätzlich"))),
  );
  assert("Inhaltliche Änderung bricht den Hash", hPlain !== hChanged);

  // ----- Leere Absätze werden gedroppt (kanonisch egal, optisch sauber) -----
  console.log("\nLeere Absätze:");
  const withEmpty: TiptapNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Erster" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Zweiter" }] },
    ],
  };
  assert("leerer Absatz wird gedroppt", tiptapToPlainText(withEmpty) === "Erster\n\nZweiter");

  // ----- Runs-Walker (Vorschau/PDF) == Hash-Projektion (kanonisch) -----
  console.log("\nRuns-Äquivalenz (Vorschau/PDF-Text == gehashter Text):");
  for (let i = 0; i < samples.length; i++) {
    const doc = plainTextToTiptap(samples[i]);
    const viaRuns = canonicalizeForHash(blocksToPlainText(tiptapToBlocks(doc)));
    const viaProjection = canonicalizeForHash(tiptapToPlainText(doc));
    assert(`Sample ${i + 1}: blocksToPlainText ≡ tiptapToPlainText`, viaRuns === viaProjection, `\n${viaRuns}\n!=\n${viaProjection}`);
  }
  // auch mit voller Formatierung (Marks ändern den Run-Text nicht)
  const fmtRuns = canonicalizeForHash(blocksToPlainText(tiptapToBlocks(all)));
  assert("formatiert: blocksToPlainText ≡ projektion", fmtRuns === canonicalizeForHash(plain));

  // ----- Editor-Fassung gegen generierten Text («Neu generieren» fragt nach) -----
  console.log("\nEditor-Fassung vs. generierter Text:");
  const gen = "Frau Anna Muster war bei uns tätig.\n\nWir danken ihr.";
  const genDoc = plainTextToTiptap(gen);
  assert("unverändert → keine Abweichung", !weichtVomGeneriertenAb(genDoc, gen));
  assert(
    "leere attrs (Tiptap-Eigenheit) → keine Abweichung",
    !weichtVomGeneriertenAb(
      {
        ...genDoc,
        content: genDoc.content!.map((p) => ({ ...p, attrs: {} })),
      },
      gen,
    ),
  );
  assert(
    "Wort geändert → Abweichung",
    weichtVomGeneriertenAb(plainTextToTiptap(gen.replace("danken", "verdanken")), gen),
  );
  assert(
    "nur fett formatiert → Abweichung",
    weichtVomGeneriertenAb(decorateAllText(genDoc, [{ type: "bold" }]), gen),
  );
  assert(
    "neuer Text, alte Fassung → Abweichung",
    weichtVomGeneriertenAb(genDoc, gen.replace("danken ihr", "danken ihr herzlich")),
  );
  assert("kein Dokument → keine Abweichung", !weichtVomGeneriertenAb(null, gen));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
