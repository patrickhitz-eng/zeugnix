/**
 * Tests für die Hash-Engine.
 *
 * Ausführen:
 *   npx tsx scripts/test-hash.ts
 *
 * Diese Tests sind absichtlich ohne Test-Framework geschrieben,
 * damit sie ohne zusätzliche Dependencies laufen.
 */

import {
  buildCanonicalString,
  canonicalizeRawText,
  computeCertificateHash,
  hashesMatch,
  normalizeSpecialChars,
  normalizeWhitespace,
  sha256,
  stripHashBlock,
  type CanonicalContent,
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

  // ----- Whitespace-Normalisierung -----
  console.log("normalizeWhitespace:");
  assert(
    "Mehrfach-Leerzeichen werden zusammengefasst",
    normalizeWhitespace("a    b   c") === "a b c",
  );
  assert(
    "Tabs werden zu Spaces",
    normalizeWhitespace("a\tb\tc") === "a b c",
  );
  assert(
    "CRLF wird zu LF",
    normalizeWhitespace("a\r\nb") === "a\nb",
  );
  assert(
    "Mehr als 2 Newlines werden auf 2 reduziert",
    normalizeWhitespace("a\n\n\n\nb") === "a\n\nb",
  );
  assert(
    "Trailing Whitespace wird entfernt",
    normalizeWhitespace("  text  ") === "text",
  );

  // ----- Sonderzeichen -----
  console.log("\nnormalizeSpecialChars:");
  assert(
    "Typografische Quotes werden zu ASCII",
    normalizeSpecialChars("\u201CHallo\u201D") === '"Hallo"',
  );
  assert(
    "En-Dash wird zu Standard-Hyphen",
    normalizeSpecialChars("a\u2013b") === "a-b",
  );
  assert(
    "NBSP wird zu Space",
    normalizeSpecialChars("a\u00A0b") === "a b",
  );

  // ----- Hash-Block-Entfernung -----
  console.log("\nstripHashBlock:");
  const withBlock = `Dies ist der Zeugnistext.

Dieses Arbeitszeugnis wurde digital erstellt und mit einem kryptografischen Echtheitsnachweis versehen.
Hash: a3f5b9c2e7d18f4a2c9e1b7d
Die Echtheit kann unter zeugnix.ch/verify geprüft werden.`;
  assert(
    "Hash-Block wird entfernt",
    stripHashBlock(withBlock).trim() === "Dies ist der Zeugnistext.",
  );

  // ----- Determinismus von canonicalizeRawText -----
  console.log("\ncanonicalizeRawText:");
  const raw1 = "Hallo  Welt\n\n\n\nDies  ist  ein  Test.";
  const raw2 = "Hallo Welt\n\nDies ist ein Test.";
  assert(
    "Whitespace-Variationen ergeben gleiche Kanonisierung",
    canonicalizeRawText(raw1) === canonicalizeRawText(raw2),
  );

  // ----- SHA-256 -----
  console.log("\nsha256:");
  const empty = await sha256("");
  assert(
    "SHA-256 von leerem String ist korrekt",
    empty === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  const a = await sha256("a");
  assert(
    "SHA-256 von 'a' ist korrekt",
    a === "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  );

  // ----- Determinismus von computeCertificateHash -----
  console.log("\ncomputeCertificateHash:");
  const content: CanonicalContent = {
    type: "schluss",
    company: { name: "Muster AG" },
    employee: {
      firstName: "Maria",
      lastName: "Beispiel",
      gender: "f",
      functionTitle: "Sachbearbeiterin",
      entryDate: "2020-01-01",
      exitDate: "2024-12-31",
    },
    body: "Frau Beispiel verfügt über sehr gute Fachkenntnisse...",
    closing: "Wir danken Frau Beispiel für die geleistete Arbeit.",
    date: "2025-01-15",
    location: "Zürich",
  };

  const result1 = await computeCertificateHash(content);
  const result2 = await computeCertificateHash(content);
  assert(
    "Identischer Inhalt → identischer Hash",
    result1.hash === result2.hash,
  );
  assert(
    "Hash hat 64 Hex-Zeichen (SHA-256)",
    result1.hash.length === 64 && /^[a-f0-9]+$/.test(result1.hash),
  );

  // Inhaltliche Änderung muss zu anderem Hash führen
  const modifiedContent = { ...content, body: content.body + " " };
  const result3 = await computeCertificateHash(modifiedContent);
  assert(
    "Whitespace-Anhang ändert Hash NICHT (kanonisiert)",
    result1.hash === result3.hash,
  );

  const reallyDifferent = { ...content, body: "Komplett anderer Text." };
  const result4 = await computeCertificateHash(reallyDifferent);
  assert(
    "Inhaltliche Änderung führt zu anderem Hash",
    result1.hash !== result4.hash,
  );

  // ----- hashesMatch -----
  console.log("\nhashesMatch:");
  assert(
    "Identische Hashes matchen",
    hashesMatch("abc123", "abc123"),
  );
  assert(
    "Case-insensitive Match",
    hashesMatch("ABC123", "abc123"),
  );
  assert(
    "Whitespace-tolerant",
    hashesMatch("  abc  ", "abc"),
  );
  assert(
    "Verschiedene Hashes matchen nicht",
    !hashesMatch("abc", "def"),
  );
  assert(
    "Leerer Hash matcht nicht",
    !hashesMatch("", "abc"),
  );

  // ----- Zusammenfassung -----
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
