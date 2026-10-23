/**
 * Rundlauf-Test: Hash durch ein ECHT erzeugtes PDF.
 *
 *   npm run test:pdf-roundtrip   (bzw. npx tsx scripts/test-pdf-roundtrip.ts)
 *
 * scripts/test-hash.ts prüft die Kanonisierung, aber mit einer NACHGEBAUTEN
 * Extraktion: dort wird ein String zusammengesetzt, der aussieht wie
 * PDF-Text. Dieser Test geht den ganzen Weg:
 *
 *   Quelltext → renderCertificatePdf → pdfjs-Textextraktion
 *            → extractBodyBetweenSentinels → canonicalizeForHash → SHA-256
 *
 * und vergleicht das Ergebnis mit dem Hash über den Quelltext. Nur so ist
 * belegt, dass die Prüfung auf zeugnio.ch ein frisch ausgestelltes Zeugnis
 * wiedererkennt.
 *
 * Warum dieser Test existiert: Die unsichtbaren Sentinels und die Meta-/
 * Signatur-Blöcke belegten im Layout rund 60pt – fast vier Textzeilen für
 * Text, den niemand sieht. Sie kleiner zu setzen ist die naheliegende
 * Platzersparnis, aber eine, die beim Scheitern NICHTS sichtbar kaputt macht:
 * Zeugnisse würden weiter erzeugt und erst beim Prüfen als ungültig gelten.
 * Eine Grenze, die kein Test prüft, wäre hier keine Grenze.
 */

import {
  canonicalizeForHash,
  decodeMetaBlock,
  encodeMetaBlock,
  extractBodyBetweenSentinels,
  extractMetaBetweenSentinels,
  hashBodyV1,
  toMetaFields,
} from "../lib/hash/canonicalize";
import { BASE_TOKENS } from "../lib/design/document-tokens";
import { renderCertificatePdf } from "../lib/pdf/certificate";

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

/** Gesamten Text eines PDFs in Leserichtung, Seite für Seite. */
async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Mit Leerzeichen verbinden: canonicalizeForHash plättet Whitespace ohnehin.
    parts.push((content.items as any[]).map((i) => i.str ?? "").join(" "));
  }
  await doc.destroy();
  return parts.join(" ");
}

const META = toMetaFields({
  employer: "Beispiel Treuhand AG",
  documentTitle: "Arbeitszeugnis",
  signatory1Name: "Daniela Muster",
  signatory1Role: "Leiterin Human Resources",
  signatory2Name: "Thomas Vorgesetzt",
  signatory2Role: "Leiter Firmenkunden",
});

/**
 * Body mit allem, was die Kanonisierung erfahrungsgemäss stolpern lässt:
 * typografische Anführungszeichen, Gedankenstriche, Umlaute, ein Bindestrich-
 * Wort, eine Aufzählung, mehrere Absätze und ein langes Wort, das umbrechen
 * muss.
 */
const BODY = [
  "Frau Andrea Beispiel-Muster, geboren am 14.03.1989, war vom 01.02.2019 bis zum 31.10.2026 als Kundenberaterin Firmenkunden in unserem Unternehmen tätig.",
  "Zu ihren Hauptaufgaben gehörten:",
  [
    "• Beratung von Geschäftskunden in Finanzierungs- und Vorsorgefragen",
    "• Mitarbeit an der Einführung des Kernbankensystems",
  ].join("\n"),
  'Ihre Arbeit bezeichnete die Geschäftsleitung als "ausgezeichnet" – eine Einschätzung, die wir vollumfänglich teilen. Sie bewältigte auch die Rahmenbedingungen der Unternehmensreorganisation souverän.',
  "Zürich, 23.10.2026",
].join("\n\n");

async function run() {
  console.log("\n=== PDF-Rundlauf: Hash über das echte Dokument ===\n");
  console.log(
    `Sentinel-Schriftgrösse: ${BASE_TOKENS.fontSize.sentinel}pt ` +
      `(unsichtbar, weiss auf Papierweiss)\n`,
  );

  const pdf = await renderCertificatePdf({
    companyName: "Beispiel Treuhand AG",
    companyAddress: "Bahnhofstrasse 42",
    companyPostalCode: "8001",
    companyCity: "Zürich",
    companyPhone: "+41 44 123 45 67",
    companyEmail: "hr@beispiel-treuhand.ch",
    companyWebsite: "www.beispiel-treuhand.ch",
    companyFooter: "Beispiel Treuhand AG · 8001 Zürich · CHE-123.456.789",

    employeeFirstName: "Andrea",
    employeeLastName: "Beispiel-Muster",

    certificateTitle: "Arbeitszeugnis",
    bodyText: BODY,
    formattedContent: null,
    themeId: "zeugnix-standard",

    signatory1Name: "Daniela Muster",
    signatory1Role: "Leiterin Human Resources",
    signatory1Email: "d.muster@beispiel-treuhand.ch",
    signatory1ConfirmedAt: "2026-10-23T09:14:00.000Z",
    signatory2Name: "Thomas Vorgesetzt",
    signatory2Role: "Leiter Firmenkunden",
    signatureMode: "digital",

    metaBlockEncoded: encodeMetaBlock(META),
    signatureBlockEncoded: Buffer.from(
      JSON.stringify({ kid: "zeugnio-2026-01", sig: Buffer.alloc(64, 7).toString("base64") }),
    ).toString("base64"),

    hash: "0".repeat(64),
    baseUrl: "https://zeugnio.ch",
  });

  const raw = await extractPdfText(pdf);

  // ----- Body -----
  console.log("Body zwischen den Sentinels:");
  const extractedBody = extractBodyBetweenSentinels(raw);
  assert("Sentinels im erzeugten PDF gefunden", extractedBody !== null);

  if (extractedBody !== null) {
    const fromPdf = canonicalizeForHash(extractedBody);
    const fromSource = canonicalizeForHash(BODY);
    assert(
      "kanonisierter Text aus dem PDF == kanonisierter Quelltext",
      fromPdf === fromSource,
      fromPdf === fromSource
        ? undefined
        : `\n      PDF:    ${JSON.stringify(fromPdf.slice(0, 160))}\n      Quelle: ${JSON.stringify(fromSource.slice(0, 160))}`,
    );

    const hashFromPdf = await hashBodyV1(extractedBody);
    const hashFromSource = await hashBodyV1(BODY);
    assert("Hash aus dem PDF == Hash aus dem Quelltext", hashFromPdf === hashFromSource);

    // Der Meta-Block steht AUSSERHALB der Body-Sentinels und darf dort nicht
    // hineingeraten – sonst würde er den Body-Hash mit verändern.
    assert(
      "Meta-Block ist nicht im extrahierten Body enthalten",
      !extractedBody.includes("zeugnix:meta-start") && !/eyJ2Ijoy/.test(extractedBody),
    );
  }

  // ----- Meta-Block -----
  console.log("\nMeta-Block (S1b):");
  const metaRaw = extractMetaBetweenSentinels(raw);
  assert("Meta-Sentinels gefunden", metaRaw !== null);
  if (metaRaw !== null) {
    const decoded = decodeMetaBlock(metaRaw);
    assert("Meta-Block dekodiert", decoded !== null);
    if (decoded) {
      assert(
        "Meta-Felder unverändert durch das PDF gelaufen",
        JSON.stringify(decoded) === JSON.stringify(META),
        `war ${JSON.stringify(decoded)}`,
      );
    }
  }

  // ----- Signatur-Block -----
  console.log("\nSignatur-Block (S2):");
  const sigMatch = /\[\[\s*zeugnix\s*:\s*sig-start\s*\]\]([\s\S]*?)\[\[\s*zeugnix\s*:\s*sig-end\s*\]\]/i.exec(
    raw,
  );
  assert("Signatur-Sentinels gefunden", sigMatch !== null);
  if (sigMatch) {
    const b64 = sigMatch[1].replace(/\s+/g, "");
    let parsed: any = null;
    try {
      parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
      /* unten als Fehlschlag sichtbar */
    }
    assert("Signatur-Block dekodiert", parsed !== null);
    assert("Schlüssel-ID erhalten", parsed?.kid === "zeugnio-2026-01");
    assert("Signatur erhalten", parsed?.sig === Buffer.alloc(64, 7).toString("base64"));
  }

  console.log(`\n--- ${passed} bestanden, ${failed} fehlgeschlagen ---\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
