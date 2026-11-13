/**
 * Test der Mastervorlage pro Firma (Schritt 30, Migration 034).
 *
 *   npm run test:mastervorlage
 *
 * Prüft die vier Teile, die der Admin pro Firma festlegt:
 *   1. Eingaben (lib/company/payload.ts): Akzentfarbe mit Kontrastprüfung,
 *      Schalter, Vorgaben, Firmenbeschrieb.
 *   2. Akzentfarbe im Theme (resolveTheme): gilt für die Standard-Stile, nie
 *      für Firsts Marken-Themes und nie, wenn sie unlesbar wäre.
 *   3. Firmenbeschrieb im erzeugten Text (lib/phrases/engine.ts).
 *   4. Echtheitsnachweis aus: das PDF zeigt keinen Hash-Block, bleibt aber
 *      über die unsichtbaren Sentinels prüfbar.
 */
import { pickCompanyFields } from "../lib/company/payload";
import { resolveTheme, isReadableAccent, DEFAULT_THEME } from "../lib/design/document-tokens";
import { generateCertificate } from "../lib/phrases/engine";
import { renderCertificatePdf } from "../lib/pdf/certificate";
import { renderCertificateDocx } from "../lib/docx/certificate";
// jszip kommt mit dem Paket «docx» (Word-Dateien sind ZIP-Archive); nur der
// Test liest damit word/document.xml.
import JSZip from "jszip";
import { extractBodyBetweenSentinels, hashBodyV1 } from "../lib/hash/canonicalize";

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
    parts.push(content.items.map((i: any) => i.str + (i.hasEOL ? "\n" : "")).join(""));
  }
  return parts.join("\n");
}

async function main() {
  // --------------------------------------------------------------- 1. Eingaben
  console.log("Eingaben (pickCompanyFields):");
  {
    const ok = pickCompanyFields({ brand_accent: " #1A4D8F " });
    check("gültige Akzentfarbe wird klein geschrieben übernommen", !ok.error && ok.data.brand_accent === "#1a4d8f");

    const hell = pickCompanyFields({ brand_accent: "#ffd400" });
    check("zu helle Akzentfarbe wird abgelehnt", !!hell.error);

    const kaputt = pickCompanyFields({ brand_accent: "blau" });
    check("kein Hex-Wert wird abgelehnt", !!kaputt.error);

    const leer = pickCompanyFields({ brand_accent: "" });
    check("leere Akzentfarbe setzt auf null zurück", !leer.error && leer.data.brand_accent === null);

    const schalter = pickCompanyFields({ show_verification_block: false, default_optin_bedauern: true });
    check(
      "Schalter werden als Boolean übernommen",
      !schalter.error && schalter.data.show_verification_block === false && schalter.data.default_optin_bedauern === true,
    );
    check("Schalter als Text wird abgelehnt", !!pickCompanyFields({ show_verification_block: "false" }).error);

    check(
      "gültige Vorgaben werden übernommen",
      (() => {
        const r = pickCompanyFields({ default_zeugnis_typ: "zwischen", default_wertschaetzungsgrad: "top" });
        return !r.error && r.data.default_zeugnis_typ === "zwischen" && r.data.default_wertschaetzungsgrad === "top";
      })(),
    );
    check("unbekannter Zeugnistyp wird abgelehnt", !!pickCompanyFields({ default_zeugnis_typ: "kuendigung" }).error);
    check("unbekannter Wertschätzungsgrad wird abgelehnt", !!pickCompanyFields({ default_wertschaetzungsgrad: "super" }).error);

    check("Firmenbeschrieb bis 600 Zeichen geht", !pickCompanyFields({ company_description: "a".repeat(600) }).error);
    check("Firmenbeschrieb über 600 Zeichen wird abgelehnt", !!pickCompanyFields({ company_description: "a".repeat(601) }).error);

    const nurName = pickCompanyFields({ name: "Muster AG" });
    check(
      "nicht übergebene Vorlagenfelder bleiben unberührt",
      !("brand_accent" in nurName.data) && !("show_verification_block" in nurName.data) && !("company_description" in nurName.data),
    );
  }

  // --------------------------------------------------------------- 2. Theme
  console.log("\nAkzentfarbe im Theme (resolveTheme):");
  {
    check("Standard ohne Akzent behält seine Farbe", resolveTheme("zeugnix-standard").colors.brandAccent === DEFAULT_THEME.colors.brandAccent);
    check("Akzent ersetzt die Farbe des Standard-Stils", resolveTheme("zeugnix-standard", "#1A4D8F").colors.brandAccent === "#1a4d8f");
    check("Akzent gilt auch für den Serif-Stil", resolveTheme("zeugnix-serif", "#1a4d8f").colors.brandAccent === "#1a4d8f");
    check("Marken-Theme behält seine kuratierte Farbe", resolveTheme("brand-first", "#1a4d8f").colors.brandAccent === "#003867");
    check("unlesbarer Akzent (z. B. per SQL) wird ignoriert", resolveTheme("zeugnix-standard", "#ffff00").colors.brandAccent === DEFAULT_THEME.colors.brandAccent);
    check("Akzent ändert sonst nichts am Theme", resolveTheme("zeugnix-standard", "#1a4d8f").colors.textPrimary === DEFAULT_THEME.colors.textPrimary);
    check("isReadableAccent: Standardfarbe ist lesbar", isReadableAccent(DEFAULT_THEME.colors.brandAccent));
  }

  // --------------------------------------------------------------- 3. Firmenbeschrieb
  console.log("\nFirmenbeschrieb im erzeugten Text:");
  {
    const employee = {
      firstName: "Andrea",
      lastName: "Muster",
      gender: "f" as const,
      functionTitle: "Sachbearbeiterin",
      entryDate: "2020-01-01",
      exitDate: "2025-12-31",
      employmentPercentage: 100,
    };
    const base = {
      type: "schluss",
      tasks: [],
      thankEmployee: true,
      location: "Zug",
      date: "2026-11-13",
      companyName: "Muster AG",
    };
    const beschrieb = "Die Muster AG ist ein Treuhandunternehmen\n\nin Zug.";

    const ab = generateCertificate(
      employee as any,
      { ...base, zeugnisTyp: "arbeitsbestaetigung", type: "arbeitsbestaetigung", companyDescription: beschrieb } as any,
      [],
      [],
    );
    const abTeile = ab.text.split("\n\n");
    check("Arbeitsbestätigung: Beschrieb steht als zweiter Absatz", abTeile[1] === "Die Muster AG ist ein Treuhandunternehmen in Zug.", abTeile[1]);

    const sz = generateCertificate(
      employee as any,
      { ...base, zeugnisTyp: "schluss", companyDescription: beschrieb } as any,
      [],
      [],
    );
    const szTeile = sz.text.split("\n\n");
    check("Schlusszeugnis: Beschrieb folgt direkt auf die Einleitung", szTeile[1] === "Die Muster AG ist ein Treuhandunternehmen in Zug.", szTeile[1]);

    const ohne = generateCertificate(employee as any, { ...base, zeugnisTyp: "schluss" } as any, [], []);
    check("ohne Beschrieb kein zusätzlicher Absatz", ohne.text.split("\n\n").length === szTeile.length - 1);
  }

  // --------------------------------------------------------------- 4. PDF ohne Nachweis
  console.log("\nPDF mit ausgeschaltetem Echtheitsnachweis:");
  {
    const BODY = "Andrea Muster war vom 1. Januar 2020 bis 31. Dezember 2025 bei uns tätig.\n\nWir danken ihr und wünschen ihr alles Gute.";
    const input = {
      companyName: "Muster AG",
      employeeFirstName: "Andrea",
      employeeLastName: "Muster",
      certificateTitle: "Arbeitszeugnis",
      bodyText: BODY,
      themeId: "zeugnix-standard",
      brandAccent: "#1a4d8f",
      signatory1Name: "Daniela Muster",
      hash: "a".repeat(64),
      baseUrl: "https://zeugnio.ch",
    };

    const mit = await extractPdfText(await renderCertificatePdf(input));
    check("Standard: Hash-Block sichtbar", mit.includes("Echtheitsnachweis") && mit.includes("a".repeat(64)));

    const ohneRaw = await extractPdfText(await renderCertificatePdf({ ...input, showVerificationBlock: false }));
    check("ausgeschaltet: kein Hash-Block, kein Prüflink", !ohneRaw.includes("Echtheitsnachweis") && !ohneRaw.includes("a".repeat(64)) && !ohneRaw.includes("/verify"));

    const body = extractBodyBetweenSentinels(ohneRaw);
    check("ausgeschaltet: unsichtbare Sentinels bleiben", body !== null);
    if (body !== null) {
      check("ausgeschaltet: Hash aus dem PDF == Hash aus dem Quelltext", (await hashBodyV1(body)) === (await hashBodyV1(BODY)));
    }

    console.log("\nWord mit ausgeschaltetem Echtheitsnachweis:");
    const wordXml = async (show: boolean) => {
      const zip = await JSZip.loadAsync(await renderCertificateDocx({ ...input, showVerificationBlock: show }));
      return (await zip.file("word/document.xml")?.async("string")) ?? "";
    };
    const wordMit = await wordXml(true);
    check("Standard: Hash im Word", wordMit.includes("a".repeat(64)) && !wordMit.includes("Arbeitskopie"));
    const wordOhne = await wordXml(false);
    check("ausgeschaltet: kein Hash, Vermerk «Arbeitskopie»", !wordOhne.includes("a".repeat(64)) && wordOhne.includes("Arbeitskopie, nicht prüfbar"));
    check("Akzentfarbe im Word-Titel", wordOhne.includes('w:val="1A4D8F"') || wordOhne.toLowerCase().includes('w:val="1a4d8f"'));
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
