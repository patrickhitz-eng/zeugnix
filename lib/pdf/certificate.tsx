/**
 * zeugnix.ch – PDF-Generator
 * ----------------------------------------------------------------------------
 * Erzeugt ein professionelles Arbeitszeugnis als PDF:
 *   - Briefkopf mit Logo und Firmenadresse
 *   - Titel (Arbeitszeugnis / Zwischenzeugnis)
 *   - Body-Text (justified)
 *   - Unterschriftsblock mit zwei Unterzeichnenden
 *   - Hash-Block + QR-Code in der Fusszeile (bei finalisierten Zeugnissen)
 *
 * Verwendet @react-pdf/renderer (server-seitig).
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

  certificateTitle: string; // "Arbeitszeugnis" oder "Zwischenzeugnis"
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

  // Letterhead
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d8dd",
    marginBottom: 28,
  },
  letterheadLeft: {
    flex: 1,
  },
  logo: {
    maxWidth: 140,
    maxHeight: 48,
    objectFit: "contain",
  },
  companyNameNoLogo: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1a1d22",
  },
  letterheadRight: {
    textAlign: "right",
    fontSize: 8.5,
    color: "#6b7178",
    lineHeight: 1.45,
  },
  letterheadCompanyName: {
    fontFamily: "Helvetica-Bold",
    color: "#1a1d22",
    marginBottom: 2,
  },

  // Title
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 24,
    marginBottom: 32,
    letterSpacing: 0.5,
  },

  // Body
  bodyParagraph: {
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: "justify",
    marginBottom: 11,
  },
  dateLine: {
    fontSize: 11,
    marginTop: 24,
    marginBottom: 6,
  },
  bullet: {
    fontSize: 11,
    marginLeft: 14,
    marginBottom: 3,
  },

  // Signatures
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
  signatureSpacer: {
    width: 20,
  },
  signatureName: {
    fontFamily: "Helvetica-Bold",
  },
  signatureRole: {
    color: "#3a3f46",
    marginTop: 1,
    fontSize: 9,
  },
  signatureEmail: {
    color: "#6b7178",
    marginTop: 1,
    fontSize: 8,
  },
  signatureConfirmed: {
    color: "#0f7a6b",
    marginTop: 3,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },

  // Hash block
  hashBlock: {
    marginTop: 36,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d8dd",
    flexDirection: "row",
    alignItems: "flex-start",
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
  qrCode: {
    width: 56,
    height: 56,
  },
});

interface CertificateDocumentProps extends RenderInput {
  qrDataUrl: string;
}

function formatConfirmation(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-CH");
  const time = d.toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `\u2713 Bestätigt am ${date} um ${time}`;
}

function CertificateDocument(props: CertificateDocumentProps) {
  const {
    companyName,
    companyAddress,
    companyPostalCode,
    companyCity,
    companyPhone,
    companyEmail,
    companyWebsite,
    companyLogoDataUrl,
    certificateTitle,
    bodyText,
    signatory1Name,
    signatory1Role,
    signatory1Email,
    signatory1ConfirmedAt,
    signatory2Name,
    signatory2Role,
    signatory2Email,
    signatory2ConfirmedAt,
    hash,
    baseUrl,
    qrDataUrl,
  } = props;

  // Body in Paragraphen splitten
  const paragraphs = bodyText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Document title={`${certificateTitle} - ${props.employeeFirstName} ${props.employeeLastName}`}>
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
            {companyLogoDataUrl && (
              <Text style={styles.letterheadCompanyName}>{companyName}</Text>
            )}
            {companyAddress ? <Text>{companyAddress}</Text> : null}
            {(companyPostalCode || companyCity) ? (
              <Text>{[companyPostalCode, companyCity].filter(Boolean).join(" ")}</Text>
            ) : null}
            {companyPhone ? <Text>{companyPhone}</Text> : null}
            {companyEmail ? <Text>{companyEmail}</Text> : null}
            {companyWebsite ? <Text>{companyWebsite}</Text> : null}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{certificateTitle}</Text>

        {/* Body */}
        <View>
          {paragraphs.map((p, i) => {
            // Bullet-Liste
            if (p.includes("•")) {
              return (
                <View key={i} style={{ marginBottom: 11 }}>
                  {p.split("\n").map((line, j) => {
                    const isBullet = line.trim().startsWith("•");
                    return (
                      <Text
                        key={`${i}-${j}`}
                        style={isBullet ? styles.bullet : styles.bodyParagraph}
                      >
                        {line}
                      </Text>
                    );
                  })}
                </View>
              );
            }
            // Datum am Ende erkennen
            const isDateLine = i === paragraphs.length - 1 && /^[A-ZÄÖÜ][a-zäöü]+,\s*\d{2}\.\d{2}\.\d{4}/.test(p);
            return (
              <Text
                key={i}
                style={isDateLine ? styles.dateLine : styles.bodyParagraph}
              >
                {p}
              </Text>
            );
          })}
        </View>

        {/* Signatures */}
        {(signatory1Name || signatory2Name) && (
          <View>
            <Text style={styles.signaturesHeader}>
              Digital ausgestellt durch
            </Text>
            <View style={styles.signatures}>
              {signatory1Name ? (
                <View style={styles.signatureCell}>
                  <Text style={styles.signatureName}>{signatory1Name}</Text>
                  {signatory1Role ? (
                    <Text style={styles.signatureRole}>{signatory1Role}</Text>
                  ) : null}
                  {signatory1Email ? (
                    <Text style={styles.signatureEmail}>{signatory1Email}</Text>
                  ) : null}
                  {signatory1ConfirmedAt ? (
                    <Text style={styles.signatureConfirmed}>
                      {formatConfirmation(signatory1ConfirmedAt)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.signatureCell} />
              )}
              <View style={styles.signatureSpacer} />
              {signatory2Name ? (
                <View style={styles.signatureCell}>
                  <Text style={styles.signatureName}>{signatory2Name}</Text>
                  {signatory2Role ? (
                    <Text style={styles.signatureRole}>{signatory2Role}</Text>
                  ) : null}
                  {signatory2Email ? (
                    <Text style={styles.signatureEmail}>{signatory2Email}</Text>
                  ) : null}
                  {signatory2ConfirmedAt ? (
                    <Text style={styles.signatureConfirmed}>
                      {formatConfirmation(signatory2ConfirmedAt)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          </View>
        )}

        {/* Hash-Block + QR */}
        <View style={styles.hashBlock}>
          <View style={styles.hashText}>
            <Text style={styles.hashLabel}>Echtheitsnachweis (SHA-256)</Text>
            <Text style={styles.hashValue}>{hash}</Text>
            <Text>
              Dieses Arbeitszeugnis wurde mit zeugnix.ch erstellt und mit
              einem kryptografischen Echtheitsnachweis versehen. Jede
              nachträgliche Veränderung des Inhalts führt zu einem
              abweichenden Hash.
            </Text>
            <Text style={{ marginTop: 3, color: "#0f7a6b" }}>
              {`Echtheit prüfen: ${baseUrl.replace(/^https?:\/\//, "")}/verify`}
            </Text>
          </View>
          {qrDataUrl ? <Image src={qrDataUrl} style={styles.qrCode} /> : null}
        </View>
      </Page>
    </Document>
  );
}

/**
 * Hauptfunktion: rendert PDF zu Buffer.
 */
export async function renderCertificatePdf(input: RenderInput): Promise<Buffer> {
  const verifyUrl = `${input.baseUrl}/verify?hash=${input.hash}`;
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
