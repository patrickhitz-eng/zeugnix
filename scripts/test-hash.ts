/**
 * Tests für die Hash-Engine.
 *
 * Ausführen:
 *   npm run test:hash   (bzw. npx tsx scripts/test-hash.ts)
 *
 * Absichtlich ohne Test-Framework, damit keine zusätzlichen Dependencies
 * nötig sind. Kerngedanke: Der Hash beim Finalisieren (über die Textquelle)
 * MUSS dem Hash beim Prüfen (über den aus dem PDF extrahierten, zwischen den
 * Sentinels isolierten Text) entsprechen.
 */

import {
  BODY_SENTINEL_START,
  BODY_SENTINEL_END,
  META_SENTINEL_START,
  META_SENTINEL_END,
  canonicalizeForHash,
  extractBodyBetweenSentinels,
  extractMetaBetweenSentinels,
  canonicalizeMeta,
  hashBodyV1,
  hashBodyMetaV2,
  encodeMetaBlock,
  decodeMetaBlock,
  sha256,
  type CertificateMetaFields,
} from "../lib/hash/canonicalize";

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

async function run() {
  console.log("\n=== Hash-Engine Tests ===\n");

  // ----- canonicalizeForHash -----
  console.log("canonicalizeForHash:");
  assert(
    "Mehrfach-Whitespace → ein Space",
    canonicalizeForHash("a    b\t\tc") === "a b c",
  );
  assert(
    "Newlines werden zu Spaces geplättet",
    canonicalizeForHash("a\n\n\n\nb") === "a b",
  );
  assert(
    "Whitespace-Variationen ergeben gleichen Output",
    canonicalizeForHash("Hallo  Welt\n\n\n\nDies\tist\tein  Test.") ===
      canonicalizeForHash("Hallo Welt Dies ist ein Test."),
  );
  assert("Trim am Rand", canonicalizeForHash("  text  ") === "text");
  assert(
    "Typografische Quotes → ASCII",
    canonicalizeForHash("“Hallo”") === '"Hallo"',
  );
  assert("En-Dash → Hyphen", canonicalizeForHash("a–b") === "a-b");
  assert("NBSP → Space", canonicalizeForHash("a b") === "a b");
  assert(
    "Bullet bleibt erhalten",
    canonicalizeForHash("• Aufgabe 1\n• Aufgabe 2") === "• Aufgabe 1 • Aufgabe 2",
  );

  // ----- sha256 (bekannte Vektoren) -----
  console.log("\nsha256:");
  assert(
    "SHA-256 von leerem String",
    (await sha256("")) ===
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert(
    "SHA-256 von 'a'",
    (await sha256("a")) ===
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  );

  // ----- extractBodyBetweenSentinels -----
  console.log("\nextractBodyBetweenSentinels:");
  assert(
    "Body wird zwischen Sentinels herausgeschnitten",
    extractBodyBetweenSentinels(
      `Briefkopf XY ${BODY_SENTINEL_START} Der Zeugnistext. ${BODY_SENTINEL_END} Unterschriften`,
    )?.trim() === "Der Zeugnistext.",
  );
  assert(
    "Fehlende Marker → null",
    extractBodyBetweenSentinels("Kein Marker hier drin") === null,
  );
  assert(
    "Nur Start-Marker → null",
    extractBodyBetweenSentinels(`x ${BODY_SENTINEL_START} y`) === null,
  );
  assert(
    "Tolerant gegen Spaces in den Klammern (pdfjs-Verklebung)",
    extractBodyBetweenSentinels(
      "a [[ zeugnix : body-start ]] B [[ zeugnix : body-end ]] c",
    )?.trim() === "B",
  );

  // ----- End-to-End-Symmetrie (Kern-Regression) -----
  console.log("\nEnd-to-End-Symmetrie (Finalize ↔ Verify):");
  const body =
    "Frau Beispiel war vom 01.01.2020 bis 31.12.2024 tätig.\n\n" +
    "Zu ihren Hauptaufgaben gehörten:\n• A\n• B\n\n" +
    "Sie erfüllte die Aufgaben stets zu unserer vollsten Zufriedenheit.\n\n" +
    "Zürich, 15.01.2025";

  // Finalize-Seite: Hash über die reine Textquelle.
  const finalizeHash = await sha256(canonicalizeForHash(body));

  // Verify-Seite: simuliert pdfjs (alle Whitespaces → " ") + Sentinels + Rauschen
  // (Briefkopf davor, Unterschriften/Hash-Block danach).
  const pdfExtract =
    "Muster AG  Musterstrasse 1  8000 Zürich  Arbeitszeugnis  " +
    BODY_SENTINEL_START +
    " " +
    body.replace(/\s+/g, " ").trim() +
    " " +
    BODY_SENTINEL_END +
    "  Digital ausgestellt durch  Max Muster  Echtheitsnachweis (SHA-256)  abcdef";
  const verifyBody = extractBodyBetweenSentinels(pdfExtract);
  const verifyHash = verifyBody
    ? await sha256(canonicalizeForHash(verifyBody))
    : "NULL";

  assert(
    "Finalize-Hash == Verify-Hash (trotz Layout-/Whitespace-Unterschied)",
    finalizeHash === verifyHash,
    `${finalizeHash} != ${verifyHash}`,
  );
  assert(
    "Inhaltliche Änderung bricht den Hash",
    finalizeHash !== (await sha256(canonicalizeForHash(body + " zusätzlich"))),
  );

  // ----- Silbentrennung (Regression: "Re- sultate") -----
  console.log("\nSilbentrennung (PDF-Hyphenation):");
  assert(
    "Zeilenumbruch-Trennstrich wird neutralisiert",
    canonicalizeForHash("durchdachte Re- sultate.") === "durchdachte Resultate.",
  );
  assert(
    "Echter Bindestrich ohne Folge-Space bleibt erhalten",
    canonicalizeForHash("Cold-Outreach via Linked-In") ===
      "Cold-Outreach via Linked-In",
  );
  assert(
    "Quelle == silbengetrenntes PDF-Extrakt (gleicher Hash)",
    (await sha256(canonicalizeForHash("Er lieferte präzise Resultate."))) ===
      (await sha256(canonicalizeForHash("Er lieferte präzise Re- sultate."))),
  );

  // ----- S1b: Meta-Block / v2-Hash -----
  console.log("\nS1b – Meta-Block & v2-Hash:");

  const meta: CertificateMetaFields = {
    employer: "Muster AG",
    documentTitle: "Arbeitszeugnis",
    signatory1Name: "Max Muster",
    signatory1Role: "CEO",
    signatory2Name: "Anna Beispiel",
    signatory2Role: "Leiterin HR",
  };

  // v1-Hash muss exakt dem alten Body-only-Hash entsprechen (Bestandsschutz).
  assert(
    "hashBodyV1 == sha256(canon(body)) (Bestandsschutz)",
    (await hashBodyV1(body)) === (await sha256(canonicalizeForHash(body))),
  );

  // v2 deckt zusätzlich die Meta-Felder -> muss sich von v1 unterscheiden.
  const v2 = await hashBodyMetaV2(body, meta);
  assert("v2-Hash != v1-Hash (Meta ist mitgedeckt)", v2 !== (await hashBodyV1(body)));

  // Jede materielle Meta-Änderung bricht den v2-Hash.
  assert(
    "Getauschter Arbeitgeber bricht v2-Hash",
    v2 !== (await hashBodyMetaV2(body, { ...meta, employer: "Fremd GmbH" })),
  );
  assert(
    "Getauschte Unterschrift bricht v2-Hash",
    v2 !== (await hashBodyMetaV2(body, { ...meta, signatory1Name: "Eve Faelscher" })),
  );
  assert(
    "Getauschter Titel bricht v2-Hash",
    v2 !== (await hashBodyMetaV2(body, { ...meta, documentTitle: "Zwischenzeugnis" })),
  );
  // Name/Rolle-Tausch (Label-Schutz): Name in Rolle verschoben ist NICHT gleich.
  assert(
    "Feld-Vertauschung (Name<->Rolle) bricht v2-Hash",
    v2 !==
      (await hashBodyMetaV2(body, {
        ...meta,
        signatory1Name: meta.signatory1Role,
        signatory1Role: meta.signatory1Name,
      })),
  );

  // canonicalizeMeta ist whitespace-tolerant pro Feld (wie der Body).
  assert(
    "canonicalizeMeta plättet Whitespace pro Feld",
    canonicalizeMeta({ ...meta, employer: "Muster   AG\n" }) ===
      canonicalizeMeta(meta),
  );

  // Base64-Block: Round-Trip encode -> decode.
  const encoded = encodeMetaBlock(meta);
  assert(
    "encode->decode ergibt identische Meta-Felder",
    JSON.stringify(decodeMetaBlock(encoded)) === JSON.stringify(meta),
  );
  // Umlaute im Meta-Block überleben (UTF-8 in Base64).
  const metaUml: CertificateMetaFields = { ...meta, signatory2Role: "Geschäftsführung" };
  assert(
    "Umlaute im Meta-Block überleben den Base64-Round-Trip",
    decodeMetaBlock(encodeMetaBlock(metaUml))?.signatory2Role === "Geschäftsführung",
  );
  // Whitespace (pdfjs-Umbrüche/Spaces) im Base64 stört das Dekodieren nicht.
  assert(
    "decodeMetaBlock ignoriert eingestreute Whitespace",
    JSON.stringify(
      decodeMetaBlock(encoded.replace(/(.{7})/g, "$1 \n ")),
    ) === JSON.stringify(meta),
  );
  assert("decodeMetaBlock('') -> null", decodeMetaBlock("") === null);
  assert("decodeMetaBlock('  ') -> null", decodeMetaBlock("   \n ") === null);

  // ----- S1b: End-to-End über ein simuliertes v2-PDF-Extrakt -----
  console.log("\nS1b – End-to-End (v2-PDF-Extrakt):");

  // Simuliert den Renderer: Base64 in 40er-Chunks (chunkForWrap) + pdfjs
  // join(" ") + zusätzliche Umbrüche.
  const chunked = encoded.replace(/(.{40})/g, "$1 ");
  const v2PdfExtract =
    "Muster AG  Musterstrasse 1  8000 Zürich  Arbeitszeugnis  " +
    BODY_SENTINEL_START +
    " " +
    body.replace(/\s+/g, " ").trim() +
    " " +
    BODY_SENTINEL_END +
    "  " +
    META_SENTINEL_START +
    " " +
    chunked +
    " " +
    META_SENTINEL_END +
    "  Digital ausgestellt durch  Max Muster  CEO  Anna Beispiel  Leiterin HR  " +
    "Echtheitsnachweis (SHA-256)  abcdef";

  const exBody = extractBodyBetweenSentinels(v2PdfExtract);
  const exMetaRaw = extractMetaBetweenSentinels(v2PdfExtract);
  const exMeta = exMetaRaw ? decodeMetaBlock(exMetaRaw) : null;

  assert("Body wird trotz Meta-Block korrekt isoliert", !!exBody);
  assert("Meta-Block wird aus dem Extrakt gelesen", !!exMeta);
  // Der aus dem PDF rekonstruierte v2-Hash == der beim Finalisieren gebildete.
  const finalizeV2 = await hashBodyMetaV2(body, meta);
  const verifyV2 =
    exBody && exMeta ? await hashBodyMetaV2(exBody, exMeta) : "NULL";
  assert(
    "Finalize-v2-Hash == Verify-v2-Hash (aus dem PDF rekonstruiert)",
    finalizeV2 === verifyV2,
    `${finalizeV2} != ${verifyV2}`,
  );
  // Der v1-Body-Hash bleibt unabhängig vom Meta-Block extrahierbar (Fallback).
  assert(
    "v1-Body-Hash aus dem v2-Extrakt == direkter v1-Hash",
    exBody
      ? (await hashBodyV1(exBody)) === (await hashBodyV1(body))
      : false,
  );

  // ----- Zusammenfassung -----
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
