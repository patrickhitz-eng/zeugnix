/**
 * zeugnix.ch – Beleg-Harnisch für das Zeugnis-Layout
 * ----------------------------------------------------------------------------
 * Erzeugt ein typisches Arbeitszeugnis als PDF **und** als Word-Datei, ohne
 * Datenbank, Anmeldung oder laufenden Server – beide Renderer sind reine
 * Funktionen über ihrem Eingabe-Objekt. Danach liest das Skript mit pdfjs aus,
 * wie viele Seiten dabei entstanden sind.
 *
 * Wozu: „passt auf eine Seite" ist eine Behauptung, bis sie gemessen ist.
 *
 *   npx tsx scripts/render-sample-certificate.ts [zielverzeichnis] [optionen]
 *
 *     --kurz | --typisch | --lang   Umfang des Beispiels (Default: --typisch)
 *     --no-logo                     ohne Platzhalter-Logo rendern
 *     --kapazitaet                  zusätzlich suchen, wie viele
 *                                   Beurteilungssätze einseitig Platz haben
 *
 * Die Zahl aus --kapazitaet ist das eigentlich vergleichbare Mass: die
 * Seitenzahl eines einzelnen Beispiels sagt nur etwas über dieses Beispiel,
 * „es haben N statt M Sätze Platz" über das Layout.
 *
 * Der Beispieltext ist bewusst fest verdrahtet und entspricht dem, was die
 * Baustein-Engine für ein Schlusszeugnis einer Nicht-Führungskraft erzeugt:
 * Einleitung, Aufgabenliste, Beurteilungsabsätze je Thema, Schlusssatz,
 * Ort/Datum. Er kommt NICHT aus der DB, damit der Beleg reproduzierbar bleibt.
 * Die unsichtbaren Meta- und Signatur-Blöcke sind mit drin: ein echtes, v2-
 * finalisiertes Zeugnis trägt sie, und sie kosten Platz.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";

import { renderCertificatePdf } from "../lib/pdf/certificate";
import { renderCertificateDocx, type DocxLogo } from "../lib/docx/certificate";
import { encodeMetaBlock, toMetaFields } from "../lib/hash/canonicalize";

// ---------------------------------------------------------------------------
// Beispiel-Zeugnis
// ---------------------------------------------------------------------------

const TASKS = [
  "Beratung von Geschäftskunden in Finanzierungs- und Vorsorgefragen",
  "Vorbereitung und Plausibilisierung der Quartalsabschlüsse",
  "Schulung und fachliche Begleitung neuer Mitarbeitender",
  "Mitarbeit an der Einführung des neuen Kernbankensystems",
];

const INTRO =
  "Frau Andrea Beispiel, geboren am 14.03.1989, war vom 01.02.2019 bis zum 31.10.2026 als Kundenberaterin Firmenkunden in unserem Unternehmen tätig.";

/**
 * Beurteilungssätze in Themenblöcken – so entstehen sie in engine.ts: ein
 * Absatz je Thema, darin ein Satz je bewerteter Eigenschaft.
 */
const THEMES: string[][] = [
  [
    "Frau Beispiel zeigte stets hohe Initiative und bewältigte ihr Arbeitspensum mit grossem Fleiss.",
    "Sie war ausgesprochen motiviert und engagierte sich weit über das von ihr Erwartete hinaus.",
    "Sie verfügte über eine breite und fundierte Berufserfahrung, die sie gezielt für die Anliegen ihrer Kundschaft einsetzte.",
    "Die ihr übertragene Verantwortung nahm sie jederzeit zuverlässig wahr und bewältigte auch anspruchsvolle Aufgaben selbständig.",
    "Ihre Fachkenntnisse waren ausgezeichnet, und sie erweiterte sie aus eigenem Antrieb kontinuierlich.",
  ],
  [
    "In ihrer Arbeitsweise war Frau Beispiel äusserst verlässlich und pflichtbewusst.",
    "Sie arbeitete selbständig, sorgfältig und genau; ihre Dossiers waren durchwegs vollständig und nachvollziehbar dokumentiert.",
    "Die Qualität ihrer Arbeit entsprach jederzeit unseren hohen Anforderungen.",
    "Mit ihren Leistungen waren wir vollumfänglich zufrieden.",
  ],
  [
    "Im persönlichen Verhalten war Frau Beispiel gegenüber Kundschaft, Vorgesetzten und Mitarbeitenden stets zuvorkommend und korrekt.",
    "Sie war eine geschätzte Teamkollegin, die ihr Wissen bereitwillig weitergab.",
    "Auch in angespannten Situationen blieb sie sachlich und besonnen.",
  ],
  [
    "Frau Beispiel dachte und handelte unternehmerisch.",
    "Sie erkannte Synergien zwischen den Geschäftsbereichen und nutzte sie konsequent.",
    "Auf wechselnde Anforderungen stellte sie sich flexibel ein.",
    "Die Bedürfnisse ihrer Kundschaft stellte sie in den Mittelpunkt ihres Handelns.",
  ],
];

const CLOSING =
  "Frau Beispiel verlässt unser Unternehmen auf eigenen Wunsch. Wir bedauern ihren Entschluss sehr, danken ihr für die stets wertvolle Mitarbeit und wünschen ihr für die berufliche und private Zukunft weiterhin viel Erfolg und alles Gute.";

const TOTAL_SENTENCES = THEMES.reduce((n, t) => n + t.length, 0);

/**
 * Baut den Body mit den ersten `sentences` Beurteilungssätzen (Themengrenzen
 * bleiben Absatzgrenzen) und `taskCount` Aufgaben.
 */
function buildBody(sentences: number, taskCount: number): string {
  const sections: string[] = [INTRO];

  if (taskCount > 0) {
    sections.push("Zu ihren Hauptaufgaben gehörten:");
    sections.push(
      TASKS.slice(0, taskCount)
        .map((t) => `• ${t}`)
        .join("\n"),
    );
  }

  let left = sentences;
  for (const theme of THEMES) {
    if (left <= 0) break;
    const take = theme.slice(0, left);
    left -= take.length;
    sections.push(take.join(" "));
  }

  sections.push(CLOSING);
  sections.push("Zürich, 23.10.2026");
  return sections.join("\n\n");
}

const UMFANG = {
  kurz: { sentences: 6, tasks: 3 },
  typisch: { sentences: 11, tasks: 4 },
  lang: { sentences: TOTAL_SENTENCES, tasks: 4 },
} as const;

/** Ein kleines PNG als Platzhalter-Logo (120x40, einfarbige Markenfläche). */
function placeholderLogoPng(): Buffer {
  const width = 120;
  const height = 40;

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // Farbtyp RGB

  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // Filter: keiner
    for (let x = 0; x < width; x++) {
      raw[o++] = 0x0f;
      raw[o++] = 0x7a;
      raw[o++] = 0x6b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const LOGO_PNG = placeholderLogoPng();

const SHARED = {
  companyName: "Beispiel Treuhand AG",
  companyAddress: "Bahnhofstrasse 42",
  companyPostalCode: "8001",
  companyCity: "Zürich",
  companyPhone: "+41 44 123 45 67",
  companyEmail: "hr@beispiel-treuhand.ch",
  companyWebsite: "www.beispiel-treuhand.ch",
  companyFooter:
    "Beispiel Treuhand AG · Bahnhofstrasse 42 · 8001 Zürich · CHE-123.456.789",

  employeeFirstName: "Andrea",
  employeeLastName: "Beispiel",

  certificateTitle: "Arbeitszeugnis",
  formattedContent: null,
  themeId: "zeugnix-standard",

  signatory1Name: "Daniela Muster",
  signatory1Role: "Leiterin Human Resources",
  signatory1Email: "d.muster@beispiel-treuhand.ch",
  signatory1ConfirmedAt: "2026-10-23T09:14:00.000Z",
  signatory2Name: "Thomas Vorgesetzt",
  signatory2Role: "Leiter Firmenkunden",
  signatory2Email: "t.vorgesetzt@beispiel-treuhand.ch",
  signatory2ConfirmedAt: "2026-10-23T10:02:00.000Z",
  signatureMode: "digital",

  hash: "9f2c4b7a1e8d35f0c6a9b4e71d208c3f5a6e9b02d47c18f3a5b9e6c20d174f8b",
  baseUrl: "https://zeugnio.ch",

  // Unsichtbare Blöcke eines v2-finalisierten, signierten Zeugnisses.
  metaBlockEncoded: encodeMetaBlock(
    toMetaFields({
      employer: "Beispiel Treuhand AG",
      documentTitle: "Arbeitszeugnis",
      signatory1Name: "Daniela Muster",
      signatory1Role: "Leiterin Human Resources",
      signatory2Name: "Thomas Vorgesetzt",
      signatory2Role: "Leiter Firmenkunden",
    }),
  ),
  signatureBlockEncoded: Buffer.from(
    JSON.stringify({
      kid: "zeugnio-2026-01",
      sig: Buffer.alloc(64, 7).toString("base64"),
    }),
  ).toString("base64"),
};

// ---------------------------------------------------------------------------
// Messen
// ---------------------------------------------------------------------------

async function openPdf(bytes: Buffer) {
  // Legacy-Build: Node-taugliches pdfjs ohne DOM.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
}

async function pdfPageCount(bytes: Buffer): Promise<number> {
  const doc = await openPdf(bytes);
  const pages = doc.numPages;
  await doc.destroy();
  return pages;
}

/** Wie weit die letzte Seite gefüllt ist: unterste Textzeile (ohne Fusszeile). */
async function lastPageFill(bytes: Buffer): Promise<string> {
  const doc = await openPdf(bytes);
  const page = await doc.getPage(doc.numPages);
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  // Die fixe Fusszeile sitzt im Unterrand und sagt nichts über die Füllung.
  const footerTop = viewport.height - 40;
  let lowest = viewport.height;
  for (const item of content.items as any[]) {
    const y = item.transform?.[5];
    if (typeof y !== "number") continue;
    if (viewport.height - y > footerTop) continue;
    if (y < lowest) lowest = y;
  }
  await doc.destroy();
  const used = viewport.height - lowest;
  return `${used.toFixed(0)}pt von ${viewport.height.toFixed(0)}pt (${((used / viewport.height) * 100).toFixed(0)}%)`;
}

async function pagesFor(sentences: number, tasks: number, logo?: string): Promise<number> {
  const pdf = await renderCertificatePdf({
    ...SHARED,
    bodyText: buildBody(sentences, tasks),
    companyLogoDataUrl: logo,
  });
  return pdfPageCount(pdf);
}

/** Grösste Zahl Beurteilungssätze, bei der das Zeugnis noch einseitig bleibt. */
async function capacity(tasks: number, logo?: string): Promise<number> {
  if ((await pagesFor(TOTAL_SENTENCES, tasks, logo)) === 1) return TOTAL_SENTENCES;
  if ((await pagesFor(0, tasks, logo)) > 1) return -1;
  let lo = 0;
  let hi = TOTAL_SENTENCES;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await pagesFor(mid, tasks, logo)) === 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const noLogo = args.includes("--no-logo");
  const withCapacity = args.includes("--kapazitaet");
  const umfang = (["kurz", "typisch", "lang"] as const).find((k) =>
    args.includes(`--${k}`),
  ) ?? "typisch";
  const outDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? "sample-output");
  await mkdir(outDir, { recursive: true });

  const { sentences, tasks } = UMFANG[umfang];
  const bodyText = buildBody(sentences, tasks);

  const docxLogo: DocxLogo | null = noLogo ? null : { data: LOGO_PNG, type: "png" };
  const pdfLogo = noLogo ? undefined : `data:image/png;base64,${LOGO_PNG.toString("base64")}`;

  const pdf = await renderCertificatePdf({ ...SHARED, bodyText, companyLogoDataUrl: pdfLogo });
  const pdfPath = path.join(outDir, "zeugnis.pdf");
  await writeFile(pdfPath, pdf);

  const docx = await renderCertificateDocx({ ...SHARED, bodyText, companyLogo: docxLogo });
  const docxPath = path.join(outDir, "zeugnis.docx");
  await writeFile(docxPath, docx);

  const pages = await pdfPageCount(pdf);
  const fill = await lastPageFill(pdf);
  const maxSentences = withCapacity ? await capacity(tasks, pdfLogo) : null;

  console.log("");
  console.log(`  Umfang:          --${umfang} (${sentences} Beurteilungssätze, ${tasks} Aufgaben)`);
  console.log(`  Logo:            ${noLogo ? "ohne" : "mit (Platzhalter)"}`);
  console.log(`  Zeichen im Body: ${bodyText.length}`);
  console.log(`  PDF-Seiten:      ${pages}${pages === 1 ? "  ✓ einseitig" : "  ✗ mehrseitig"}`);
  console.log(`  Letzte Seite:    ${fill} belegt`);
  if (maxSentences !== null) {
    console.log(
      `  Kapazität:       ${maxSentences} von ${TOTAL_SENTENCES} Beurteilungssätzen passen einseitig` +
        ` (bei ${tasks} Aufgaben)`,
    );
  }
  console.log("");
  console.log(`  ${pdfPath}`);
  console.log(`  ${docxPath}`);
  console.log("");

  await writeFile(
    path.join(outDir, "messung.json"),
    JSON.stringify(
      { umfang, pages, fill, bodyChars: bodyText.length, logo: !noLogo, maxSentences },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
