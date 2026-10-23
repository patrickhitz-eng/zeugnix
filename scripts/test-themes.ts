/**
 * Tests für die Design-Tokens des Zeugnis-Dokuments.
 *
 * Ausführen:
 *   npm run test:themes   (bzw. npx tsx scripts/test-themes.ts)
 *
 * Drei Aufgaben:
 *  1. REGRESSIONSSPERRE: buildPdfStyles(Standard-Theme) muss exakt die unten
 *     hartkodierten Werte liefern. Sie sind bewusst NICHT aus den Tokens
 *     abgeleitet, sonst wäre der Test zirkulär und würde jede versehentliche
 *     Layout-Änderung mitwandern. Wer die Tokens ändert, ändert diese Liste
 *     mit – und erklärt dabei, warum.
 *
 *     Stand der Werte und ihre Herkunft:
 *      - fontFamily: auf Inter/Inter-Bold gesetzt, als die Hausschrift des
 *        Standard-Themes von Helvetica auf die eingebettete Inter wechselte.
 *      - title.color: Markenfarbe statt Schwarz (Call 2026-07-24).
 *      - Geometrie und Schriftgrössen: VERDICHTUNG 2026-10-23. Vorher belegte
 *        das Gerüst (Briefkopf, Titel, Unterschriften, Hash-Block, unsichtbare
 *        Blöcke) rund 70% einer A4-Seite, wodurch ein Zeugnis selbst mit sehr
 *        kurzem Text NIE einseitig wurde – gemessen mit
 *        scripts/render-sample-certificate.ts --kapazitaet, die vor der
 *        Änderung -1 ergab (kein Umfang passt) und danach 6–7
 *        Beurteilungssätze. Fliesstext 11 -> 10.5pt (halbe Stufe), Titel
 *        18 -> 16pt, Briefkopf 8.5 -> 8pt, Sentinels 6 -> 4pt. Die
 *        Sentinel-Grösse ist zusätzlich durch scripts/test-pdf-roundtrip.ts
 *        abgesichert, das den Hash durch ein echt erzeugtes PDF zurückrechnet.
 *  2. BARRIEREFREIHEIT: jedes Built-in-Theme erfüllt WCAG AA gegen Papierweiss.
 *     Ein neues Marken-Theme mit zu blasser Farbe lässt den Build scheitern.
 *  3. RÜCKWÄRTSKOMPATIBILITÄT: die Alt-Werte der Spalte
 *     default_certificate_font_family lösen weiterhin auf das passende Theme auf.
 */

import {
  BRAND_THEMES,
  BUILTIN_THEMES,
  DEFAULT_THEME,
  assertThemeReadable,
  contrastRatio,
  resolveTheme,
  resolveThemeFromCompany,
  WCAG_AA_NORMAL_TEXT,
} from "../lib/design/document-tokens";
import { buildPdfStyles } from "../lib/design/document-pdf-styles";

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

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(name, a === e, `erwartet ${e}, war ${a}`);
}

// ---------------------------------------------------------------------------
// 1. Regressionssperre: Werte aus dem Stand VOR dem Token-Refactor
// ---------------------------------------------------------------------------
console.log("\nPDF-Styles: unveränderte Werte (Stand vor dem Refactor)");
{
  const s = buildPdfStyles(DEFAULT_THEME) as any;

  eq("page", s.page, {
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 60,
    fontFamily: "Inter",
    fontSize: 10.5,
    lineHeight: 1.5,
    color: "#1a1d22",
  });
  eq("letterhead", s.letterhead, {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d8dd",
    marginBottom: 16,
  });
  eq("logo", s.logo, { maxWidth: 140, maxHeight: 42, objectFit: "contain" });
  eq("companyNameNoLogo", s.companyNameNoLogo, {
    fontSize: 13,
    fontFamily: "Inter-Bold",
  });
  eq("letterheadRight", s.letterheadRight, {
    textAlign: "right",
    fontSize: 8,
    color: "#6b7178",
    lineHeight: 1.3,
    width: 200,
  });
  eq("letterheadCompanyName", s.letterheadCompanyName, {
    fontFamily: "Inter-Bold",
    color: "#1a1d22",
    marginBottom: 2,
  });
  eq("title", s.title, {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    // Titel trägt seit dem Call 2026-07-24 die Markenfarbe; im Standard-Theme
    // ist das der Petrol-Akzent.
    color: "#0f7a6b",
    textAlign: "center",
    // Eigene Zeilenhöhe: der Titel ist einzeilig und brauchte den Durchschuss
    // des Fliesstexts nicht, den er vorher über lineHeight.page erbte.
    lineHeight: 1.2,
    marginTop: 12,
    marginBottom: 18,
    letterSpacing: 0.5,
  });
  eq("bodyParagraph", s.bodyParagraph, {
    fontSize: 10.5,
    lineHeight: 1.5,
    textAlign: "justify",
    marginBottom: 9,
  });
  eq("bullet", s.bullet, { fontSize: 10.5, marginLeft: 14, marginBottom: 3 });
  // Unsichtbar (weiss auf Papierweiss), aber als Fliesstext mit echter
  // Zeilenhöhe. Nicht weiter verkleinern ohne npm run test:pdf-roundtrip.
  eq("sentinel", s.sentinel, { fontSize: 4, color: "#ffffff", lineHeight: 1 });
  eq("signaturesHeader", s.signaturesHeader, {
    fontFamily: "Inter-Bold",
    fontSize: 8,
    color: "#0f7a6b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  });
  eq("signatures", s.signatures, { flexDirection: "row", marginTop: 4 });
  // Freiraum zum Unterschreiben von Hand – vorher Inline-Literale in
  // lib/pdf/certificate.tsx, die der Word-Export nicht kannte.
  eq("signatureHandwrittenSpace", s.signatureHandwrittenSpace, {
    marginTop: 20,
    height: 72,
  });
  eq("hashBlockAfterHandwritten", s.hashBlockAfterHandwritten, { marginTop: 9 });
  eq("signatureCell", s.signatureCell, {
    flex: 1,
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: "#1a1d22",
    fontSize: 10,
  });
  eq("signatureSpacer", s.signatureSpacer, { width: 20 });
  eq("signatureName", s.signatureName, { fontFamily: "Inter-Bold" });
  eq("signatureRole", s.signatureRole, {
    color: "#3a3f46",
    marginTop: 1,
    fontSize: 9,
  });
  eq("signatureEmail", s.signatureEmail, {
    color: "#6b7178",
    marginTop: 1,
    fontSize: 8,
  });
  eq("signatureConfirmed", s.signatureConfirmed, {
    color: "#0f7a6b",
    marginTop: 3,
    fontSize: 7.5,
    fontFamily: "Inter-Bold",
  });
  eq("hashBlock", s.hashBlock, {
    marginTop: 16,
    paddingTop: 9,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d8dd",
    flexDirection: "row",
  });
  eq("hashText", s.hashText, {
    flex: 1,
    paddingRight: 16,
    fontSize: 7.5,
    color: "#6b7178",
    lineHeight: 1.5,
  });
  eq("hashLabel", s.hashLabel, {
    fontFamily: "Inter-Bold",
    color: "#0f7a6b",
    fontSize: 7,
    letterSpacing: 0.6,
    marginBottom: 3,
  });
  eq("hashValue", s.hashValue, {
    fontFamily: "Inter",
    color: "#1a1d22",
    fontSize: 7.5,
    marginBottom: 4,
  });
  eq("hashLink", s.hashLink, { marginTop: 3, color: "#0f7a6b" });
  eq("qrCode", s.qrCode, { width: 56, height: 56 });
}

console.log("\nPDF-Styles: Body-Schrift folgt dem Theme, Titel bleibt Helvetica-Bold");
{
  const serif = buildPdfStyles(BUILTIN_THEMES["zeugnix-serif"]) as any;
  const mono = buildPdfStyles(BUILTIN_THEMES["zeugnix-mono"]) as any;
  // Titel und Briefkopf waren immer Helvetica-Bold, unabhängig von der Firmenwahl.
  eq("serif: Titel-Schrift", serif.title.fontFamily, "Helvetica-Bold");
  eq("mono: Titel-Schrift", mono.title.fontFamily, "Helvetica-Bold");
  eq("serif: Hash-Schrift", serif.hashValue.fontFamily, "Courier");

  // Titel trägt die Markenfarbe: im Standard-Theme Petrol, im Marken-Theme die
  // jeweilige Firmenfarbe (First Advisory = #003867).
  const brand = buildPdfStyles(BRAND_THEMES["brand-first"]) as any;
  const standard = buildPdfStyles(DEFAULT_THEME) as any;
  eq("brand: Titel-Farbe = Markenfarbe", brand.title.color, "#003867");
  eq("standard: Titel-Farbe = Petrol", standard.title.color, "#0f7a6b");
}

// ---------------------------------------------------------------------------
// 2. Barrierefreiheit
// ---------------------------------------------------------------------------
console.log("\nKontrast (WCAG AA gegen Papierweiss)");
{
  // Referenzwerte gegen #ffffff, gerundet.
  const petrol = contrastRatio("#0f7a6b", "#ffffff");
  assert(
    `Petrol #0f7a6b erreicht ${petrol.toFixed(2)}:1 (>= ${WCAG_AA_NORMAL_TEXT})`,
    petrol >= WCAG_AA_NORMAL_TEXT,
  );
  assert("Schwarz auf Weiss = 21:1", Math.round(contrastRatio("#000000", "#ffffff")) === 21);
  assert("Weiss auf Weiss = 1:1", Math.round(contrastRatio("#ffffff", "#ffffff")) === 1);
  assert("Kontrast ist symmetrisch", contrastRatio("#0f7a6b", "#ffffff") === contrastRatio("#ffffff", "#0f7a6b"));

  // Öffentliche Standard-Themes UND private Marken-Themes: ein zu blasser
  // brandAccent in einem Marken-Theme soll den Build genauso brechen.
  const allThemes = { ...BUILTIN_THEMES, ...BRAND_THEMES };
  for (const theme of Object.values(allThemes)) {
    let ok = true;
    try {
      assertThemeReadable(theme);
    } catch {
      ok = false;
    }
    assert(`Theme "${theme.id}" erfüllt WCAG AA`, ok);
  }

  // Marken-Themes lösen über ihre gespeicherte ID auf (Whitelabeling-Provisionierung).
  for (const theme of Object.values(BRAND_THEMES)) {
    eq(`Marken-Theme "${theme.id}" auflösbar`, resolveTheme(theme.id).id, theme.id);
  }

  // Gegenprobe: ein zu blasses Theme MUSS scheitern.
  let threw = false;
  try {
    assertThemeReadable({
      ...DEFAULT_THEME,
      id: "zu-blass",
      colors: { ...DEFAULT_THEME.colors, brandAccent: "#9fe0d5" },
    });
  } catch {
    threw = true;
  }
  assert("Zu blasse Markenfarbe wird abgelehnt", threw);
}

// ---------------------------------------------------------------------------
// 3. Rückwärtskompatibilität der Spalte default_certificate_font_family
// ---------------------------------------------------------------------------
console.log("\nLegacy-Mapping (keine Migration nötig)");
{
  eq("'helvetica' -> Standard", resolveTheme("helvetica").id, "zeugnix-standard");
  eq("'times' -> Serif", resolveTheme("times").id, "zeugnix-serif");
  eq("'courier' -> Mono", resolveTheme("courier").id, "zeugnix-mono");
  eq("Theme-ID bleibt stabil", resolveTheme("zeugnix-serif").id, "zeugnix-serif");
  eq("null -> Standard", resolveTheme(null).id, "zeugnix-standard");
  eq("unbekannt -> Standard", resolveTheme("gibt-es-nicht").id, "zeugnix-standard");
  eq(
    "Firma ohne Stil -> Standard",
    resolveThemeFromCompany({}).id,
    "zeugnix-standard",
  );
  eq(
    "Firma mit Alt-Font -> Serif",
    resolveThemeFromCompany({ default_certificate_font_family: "times" }).id,
    "zeugnix-serif",
  );
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed === 0 ? 0 : 1);
