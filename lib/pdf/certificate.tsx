/**
 * zeugnix.ch – PDF-Generator (robust)
 * ----------------------------------------------------------------------------
 * Erzeugt ein professionelles Arbeitszeugnis als PDF.
 * Defensiv geschrieben: alle Texte werden vorher zu sauberen Strings
 * konvertiert, bevor sie an <Text> gegeben werden.
 */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import path from "node:path";
import React from "react";
import {
  BODY_SENTINEL_START,
  BODY_SENTINEL_END,
  META_SENTINEL_START,
  META_SENTINEL_END,
  SIG_SENTINEL_START,
  SIG_SENTINEL_END,
  buildVerifyUrl,
} from "@/lib/hash/canonicalize";
import type { TiptapDoc } from "@/lib/certificate/tiptap-plaintext";
import { tiptapToPdf } from "./tiptap-to-pdf";
import { resolveTheme, type DocumentTheme } from "@/lib/design/document-tokens";
import { buildPdfStyles } from "@/lib/design/document-pdf-styles";

// Auto-Silbentrennung abschalten: @react-pdf würde lange Wörter am Zeilenende
// mit eingefügtem Bindestrich umbrechen ("Resultate" -> "Re-" + "sultate").
// Beim Auslesen des PDFs landen diese Trennstriche im Text und brechen den
// Echtheits-Hash. Wir geben jedes Wort ungeteilt zurück → Umbruch nur an
// Leerzeichen, extrahierter Text == Quelltext.
Font.registerHyphenationCallback((word) => [word]);

// Hausschrift Inter (OFL) einbetten. Zwei getrennte Familien (Inter / Inter-Bold)
// – passt zum expliziten Fontnamen-Muster in lib/pdf/fonts.ts (pdfFontName).
// Dateien liegen in public/fonts/ und werden auf Vercel über
// outputFileTracingIncludes (next.config.mjs) in die Serverless-Function
// mitgetraced; hier von der Platte gelesen (kein Netzwerk-Fetch pro Render).
// Kursivschnitte entfallen bewusst – Kursiv ist im Arbeitszeugnis unzulässig.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "Inter",
  src: path.join(FONT_DIR, "Inter-Regular.ttf"),
});
Font.register({
  family: "Inter-Bold",
  src: path.join(FONT_DIR, "Inter-Bold.ttf"),
});

interface RenderInput {
  companyName: string;
  companyAddress?: string;
  companyPostalCode?: string;
  companyCity?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoDataUrl?: string;

  employeeFirstName: string;
  employeeLastName: string;

  certificateTitle: string;
  bodyText: string;
  // Optionaler formatierter Body (Rich-Text). Ist er gesetzt, wird er statt
  // bodyText gerendert; bodyText bleibt der Hash-/Fallback-Klartext.
  formattedContent?: TiptapDoc | null;
  /**
   * Theme-ID des Dokuments (lib/design/document-tokens.ts). Versteht auch die
   * Alt-Werte 'helvetica'|'times'|'courier' aus companies.
   * default_certificate_font_family. Leer -> Standard-Theme.
   */
  themeId?: string;

  signatory1Name?: string;
  signatory1Role?: string;
  signatory1Email?: string;
  signatory1ConfirmedAt?: string;
  signatory2Name?: string;
  signatory2Role?: string;
  signatory2Email?: string;
  signatory2ConfirmedAt?: string;
  /** Unterschrifts-Modus; 'handwritten' blendet den Kopf „Digital ausgestellt durch" aus. */
  signatureMode?: string;

  /**
   * S1b: Base64(JSON) der eingefrorenen Meta-Felder (Arbeitgeber/Titel/
   * Unterzeichnende). Wird als unsichtbarer, maschinenlesbarer Block eingebettet,
   * damit die Prüfung den v2-Hash rekonstruieren kann. Leer/undefined -> kein
   * Block (v1-/Alt-Zeugnis, Bestandsschutz).
   */
  metaBlockEncoded?: string;

  /**
   * S2: Base64(JSON) des Signatur-Blocks { kid, sig } (Ed25519 über den
   * v2-Hash). Wird als unsichtbarer, maschinenlesbarer Block eingebettet, damit
   * die Prüfung die Signatur offline verifizieren kann. Leer/undefined -> kein
   * Block (Alt-Zeugnis oder kein Schlüssel konfiguriert, Bestandsschutz).
   */
  signatureBlockEncoded?: string;

  hash: string;
  baseUrl: string;
}

// Base64 hat keine Leerzeichen -> als ein einziges "Wort" würde @react-pdf es
// (Auto-Silbentrennung ist global aus) nicht umbrechen und über den Seitenrand
// schieben, wodurch Zeichen beim Extrahieren verloren gehen könnten. Deshalb
// künstliche Umbruchpunkte alle 40 Zeichen; beim Prüfen wird sämtliche
// Whitespace wieder entfernt (decodeMetaBlock), der Wert bleibt also identisch.
function chunkForWrap(value: string, size = 40): string {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts.join(" ");
}

// ============================================================================
// Defensiv-Helper: garantiert String
// ============================================================================
function s(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatConfirmation(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("de-CH");
    const time = d.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return "\u2713 Best\u00e4tigt am " + date + " um " + time;
  } catch {
    return "\u2713 Best\u00e4tigt";
  }
}

// ============================================================================
// Document
// ============================================================================
interface DocProps extends RenderInput {
  qrDataUrl: string;
  theme: DocumentTheme;
}

function CertificateDocument(props: DocProps) {
  const styles = buildPdfStyles(props.theme);

  // Defensive Konversion ALLER Strings vorab
  const companyName = s(props.companyName);
  const companyAddress = s(props.companyAddress);
  const companyPostalCode = s(props.companyPostalCode);
  const companyCity = s(props.companyCity);
  const companyPhone = s(props.companyPhone);
  const companyEmail = s(props.companyEmail);
  const companyWebsite = s(props.companyWebsite);
  const companyLogoDataUrl = props.companyLogoDataUrl;
  const certificateTitle = s(props.certificateTitle);
  const bodyText = s(props.bodyText);
  const signatory1Name = s(props.signatory1Name);
  const signatory1Role = s(props.signatory1Role);
  const signatory1Email = s(props.signatory1Email);
  const signatory1Confirmed = props.signatory1ConfirmedAt
    ? formatConfirmation(props.signatory1ConfirmedAt)
    : "";
  const signatory2Name = s(props.signatory2Name);
  const signatory2Role = s(props.signatory2Role);
  const signatory2Email = s(props.signatory2Email);
  const signatory2Confirmed = props.signatory2ConfirmedAt
    ? formatConfirmation(props.signatory2ConfirmedAt)
    : "";
  const hash = s(props.hash);
  const baseUrl = s(props.baseUrl);
  const qrDataUrl = s(props.qrDataUrl);
  const metaBlockEncoded = s(props.metaBlockEncoded);
  const signatureBlockEncoded = s(props.signatureBlockEncoded);
  // Handunterschrift: Fläche zum Unterschreiben schaffen und die Namen bündig an
  // die Trennlinie über dem Hash rücken (der „Digital ausgestellt durch"-Kopf
  // entfällt in diesem Modus).
  const isHandwritten = props.signatureMode === "handwritten";

  const cityLine = [companyPostalCode, companyCity]
    .filter((x) => x.length > 0)
    .join(" ");

  const verifyLink = "Echtheit prüfen: " + baseUrl.replace(/^https?:\/\//, "") + "/verify";

  // Body: formatierter Rich-Text (falls vorhanden), sonst Plain-Text-Fallback.
  const formattedBody = props.formattedContent
    ? tiptapToPdf(props.formattedContent, props.theme)
    : null;
  const paragraphs: string[] = bodyText
    .split(/\n\n+/)
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);

  const docTitle = certificateTitle + " - " + s(props.employeeFirstName) + " " + s(props.employeeLastName);

  return (
    <Document title={docTitle}>
      <Page size="A4" style={styles.page}>
        {/* Letterhead */}
        <View style={styles.letterhead}>
          <View style={styles.letterheadLeft}>
            {companyLogoDataUrl ? (
              <Image src={companyLogoDataUrl} style={styles.logo} />
            ) : (
              <Text style={styles.companyNameNoLogo}>{companyName}</Text>
            )}
          </View>
          <View style={styles.letterheadRight}>
            {companyLogoDataUrl ? (
              <Text style={styles.letterheadCompanyName}>{companyName}</Text>
            ) : null}
            {companyAddress.length > 0 ? <Text>{companyAddress}</Text> : null}
            {cityLine.length > 0 ? <Text>{cityLine}</Text> : null}
            {companyPhone.length > 0 ? <Text>{companyPhone}</Text> : null}
            {companyEmail.length > 0 ? <Text>{companyEmail}</Text> : null}
            {companyWebsite.length > 0 ? <Text>{companyWebsite}</Text> : null}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{certificateTitle}</Text>

        {/* Body – von unsichtbaren Sentinels eingerahmt (für Verify) */}
        <View>
          <Text style={styles.sentinel}>{BODY_SENTINEL_START}</Text>
          {formattedBody
            ? formattedBody
            : paragraphs.map((p: string, i: number) => (
                <Text key={"p-" + i} style={styles.bodyParagraph}>
                  {p}
                </Text>
              ))}
          <Text style={styles.sentinel}>{BODY_SENTINEL_END}</Text>
        </View>

        {/* S1b: unsichtbarer Meta-Block (Aussteller/Titel/Unterzeichnende),
            AUSSERHALB der Body-Sentinels – ändert den v1-Body-Hash nicht, deckt
            aber in v2 die materiellen Kopf-/Unterschriftsdaten mit ab. */}
        {metaBlockEncoded.length > 0 ? (
          <View>
            <Text style={styles.sentinel}>{META_SENTINEL_START}</Text>
            <Text style={styles.sentinel}>{chunkForWrap(metaBlockEncoded)}</Text>
            <Text style={styles.sentinel}>{META_SENTINEL_END}</Text>
          </View>
        ) : null}

        {/* S2: unsichtbarer Signatur-Block (Ed25519 über den v2-Hash),
            ausserhalb aller Body-/Meta-Sentinels. Erlaubt der Prüfung, die
            Ausstellung offline gegen den öffentlichen Plattform-Schlüssel zu
            verifizieren. Ändert Body- und Meta-Hash nicht. */}
        {signatureBlockEncoded.length > 0 ? (
          <View>
            <Text style={styles.sentinel}>{SIG_SENTINEL_START}</Text>
            <Text style={styles.sentinel}>{chunkForWrap(signatureBlockEncoded)}</Text>
            <Text style={styles.sentinel}>{SIG_SENTINEL_END}</Text>
          </View>
        ) : null}

        {/* Signatures */}
        {signatory1Name.length > 0 || signatory2Name.length > 0 ? (
          <View>
            {isHandwritten ? (
              // Leerraum als handschriftliche Unterschriftsfläche ÜBER der
              // Unterschriftslinie. marginTop ersetzt den entfallenden
              // „Digital ausgestellt durch"-Kopf; height = Platz zum Unterschreiben.
              <View style={{ marginTop: 36, height: 54 }} />
            ) : (
              <Text style={styles.signaturesHeader}>Digital ausgestellt durch</Text>
            )}
            <View style={styles.signatures}>
              <View style={styles.signatureCell}>
                {signatory1Name.length > 0 ? (
                  <Text style={styles.signatureName}>{signatory1Name}</Text>
                ) : null}
                {signatory1Role.length > 0 ? (
                  <Text style={styles.signatureRole}>{signatory1Role}</Text>
                ) : null}
                {signatory1Email.length > 0 ? (
                  <Text style={styles.signatureEmail}>{signatory1Email}</Text>
                ) : null}
                {signatory1Confirmed.length > 0 ? (
                  <Text style={styles.signatureConfirmed}>{signatory1Confirmed}</Text>
                ) : null}
              </View>
              <View style={styles.signatureSpacer} />
              <View style={styles.signatureCell}>
                {signatory2Name.length > 0 ? (
                  <Text style={styles.signatureName}>{signatory2Name}</Text>
                ) : null}
                {signatory2Role.length > 0 ? (
                  <Text style={styles.signatureRole}>{signatory2Role}</Text>
                ) : null}
                {signatory2Email.length > 0 ? (
                  <Text style={styles.signatureEmail}>{signatory2Email}</Text>
                ) : null}
                {signatory2Confirmed.length > 0 ? (
                  <Text style={styles.signatureConfirmed}>{signatory2Confirmed}</Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Hash + QR */}
        {/* Handunterschrift: kleinerer Abstand, damit die Namen bündig auf der
            Trennlinie über dem Hash sitzen (Standard 36 lässt sonst eine Lücke). */}
        <View style={isHandwritten ? [styles.hashBlock, { marginTop: 14 }] : styles.hashBlock}>
          <View style={styles.hashText}>
            <Text style={styles.hashLabel}>Echtheitsnachweis (SHA-256)</Text>
            <Text style={styles.hashValue}>{hash}</Text>
            <Text>
              Dieses Arbeitszeugnis wurde mit zeugnio.ch erstellt und mit einem
              kryptografischen Echtheitsnachweis versehen. Jede nachträgliche
              Veränderung des Inhalts führt zu einem abweichenden Hash.
            </Text>
            <Text style={styles.hashLink}>{verifyLink}</Text>
          </View>
          {qrDataUrl.length > 0 ? (
            <Image src={qrDataUrl} style={styles.qrCode} />
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(input: RenderInput): Promise<Buffer> {
  const theme = resolveTheme(input.themeId);
  const verifyUrl = buildVerifyUrl(input.baseUrl, input.hash);
  // QR-Code bewusst schwarz auf weiss (nicht in Markenfarbe): schwarze Module
  // haben den höchsten Kontrast und lassen sich am zuverlässigsten scannen –
  // gerade beim ausgedruckten/gescannten Zeugnis (Wunsch Call 2026-07-24).
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 0,
    width: 200,
    color: { dark: theme.colors.textPrimary, light: theme.colors.paper },
  });

  const buffer = await renderToBuffer(
    React.createElement(CertificateDocument, {
      ...input,
      qrDataUrl,
      theme,
    }) as any,
  );
  return buffer as unknown as Buffer;
}
