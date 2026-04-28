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
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import React from "react";

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

  signatory1Name?: string;
  signatory1Role?: string;
  signatory1Email?: string;
  signatory1ConfirmedAt?: string;
  signatory2Name?: string;
  signatory2Role?: string;
  signatory2Email?: string;
  signatory2ConfirmedAt?: string;

  hash: string;
  baseUrl: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.55,
    color: "#1a1d22",
  },

  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d8dd",
    marginBottom: 28,
  },
  letterheadLeft: { flex: 1 },
  logo: { maxWidth: 140, maxHeight: 48, objectFit: "contain" },
  companyNameNoLogo: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  letterheadRight: {
    textAlign: "right",
    fontSize: 8.5,
    color: "#6b7178",
    lineHeight: 1.45,
    width: 200,
  },
  letterheadCompanyName: {
    fontFamily: "Helvetica-Bold",
    color: "#1a1d22",
    marginBottom: 2,
  },

  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 24,
    marginBottom: 32,
    letterSpacing: 0.5,
  },

  bodyParagraph: {
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: "justify",
    marginBottom: 11,
  },
  bullet: {
    fontSize: 11,
    marginLeft: 14,
    marginBottom: 3,
  },

  signaturesHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0f7a6b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 36,
    marginBottom: 8,
  },
  signatures: {
    flexDirection: "row",
    marginTop: 4,
  },
  signatureCell: {
    flex: 1,
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: "#1a1d22",
    fontSize: 10,
  },
  signatureSpacer: { width: 20 },
  signatureName: { fontFamily: "Helvetica-Bold" },
  signatureRole: { color: "#3a3f46", marginTop: 1, fontSize: 9 },
  signatureEmail: { color: "#6b7178", marginTop: 1, fontSize: 8 },
  signatureConfirmed: {
    color: "#0f7a6b",
    marginTop: 3,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },

  hashBlock: {
    marginTop: 36,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d8dd",
    flexDirection: "row",
  },
  hashText: {
    flex: 1,
    paddingRight: 16,
    fontSize: 7.5,
    color: "#6b7178",
    lineHeight: 1.5,
  },
  hashLabel: {
    fontFamily: "Helvetica-Bold",
    color: "#0f7a6b",
    fontSize: 7,
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  hashValue: {
    fontFamily: "Courier",
    color: "#1a1d22",
    fontSize: 7.5,
    marginBottom: 4,
  },
  hashLink: {
    marginTop: 3,
    color: "#0f7a6b",
  },
  qrCode: { width: 56, height: 56 },
});

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
    return "\u2713 Bestaetigt am " + date + " um " + time;
  } catch {
    return "\u2713 Bestaetigt";
  }
}

// ============================================================================
// Document
// ============================================================================
interface DocProps extends RenderInput {
  qrDataUrl: string;
}

function CertificateDocument(props: DocProps) {
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

  const cityLine = [companyPostalCode, companyCity]
    .filter((x) => x.length > 0)
    .join(" ");

  const verifyLink = "Echtheit pruefen: " + baseUrl.replace(/^https?:\/\//, "") + "/verify";

  // Body in Paragraphen splitten
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

        {/* Body */}
        <View>
          {paragraphs.map((p: string, i: number) => (
            <Text key={"p-" + i} style={styles.bodyParagraph}>
              {p}
            </Text>
          ))}
        </View>

        {/* Signatures */}
        {signatory1Name.length > 0 || signatory2Name.length > 0 ? (
          <View>
            <Text style={styles.signaturesHeader}>Digital ausgestellt durch</Text>
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
        <View style={styles.hashBlock}>
          <View style={styles.hashText}>
            <Text style={styles.hashLabel}>Echtheitsnachweis (SHA-256)</Text>
            <Text style={styles.hashValue}>{hash}</Text>
            <Text>
              Dieses Arbeitszeugnis wurde mit zeugnix.ch erstellt und mit einem
              kryptografischen Echtheitsnachweis versehen. Jede nachtraegliche
              Veraenderung des Inhalts fuehrt zu einem abweichenden Hash.
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
  const verifyUrl = input.baseUrl + "/verify?hash=" + input.hash;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 0,
    width: 200,
    color: { dark: "#0f7a6b", light: "#ffffff" },
  });

  const buffer = await renderToBuffer(
    React.createElement(CertificateDocument, {
      ...input,
      qrDataUrl,
    }) as any,
  );
  return buffer as unknown as Buffer;
}
