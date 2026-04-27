/**
 * zeugnix.ch – PDF-Generator
 * ----------------------------------------------------------------------------
 * Erzeugt ein Arbeitszeugnis als PDF mit Briefkopf, Volltext, Schlussformel,
 * Hash-Block und QR-Code zur Verifikation.
 *
 * Verwendet @react-pdf/renderer (server-seitig). Der QR-Code wird über
 * 'qrcode' als Data-URL erzeugt und ins PDF eingebettet.
 *
 * Aufruf:
 *   const buffer = await renderCertificatePdf({ ... });
 */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import React from "react";
import { buildHashBlockText, buildVerifyUrl } from "@/lib/hash/canonicalize";

interface RenderInput {
  companyName: string;
  companyAddress?: string;
  companyLogoDataUrl?: string;
  employeeFirstName: string;
  employeeLastName: string;
  bodyText: string; // generierter Volltext
  hash: string;
  baseUrl: string; // z.B. https://zeugnix.ch
  location: string;
  date: string; // ISO YYYY-MM-DD
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.55,
    color: "#15191E",
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 40,
    paddingBottom: 14,
    borderBottomWidth: 0.6,
    borderBottomColor: "#D5D8DD",
  },
  companyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  companyAddress: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 2,
  },
  logo: { width: 60, height: 30, objectFit: "contain" },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#1F2328",
  },
  paragraph: {
    marginBottom: 10,
  },
  hashBlock: {
    marginTop: 32,
    paddingTop: 14,
    borderTopWidth: 0.6,
    borderTopColor: "#D5D8DD",
    flexDirection: "row",
    gap: 14,
  },
  hashText: {
    flex: 1,
    fontSize: 8.5,
    color: "#6B7280",
    lineHeight: 1.55,
  },
  hashValue: {
    fontFamily: "Courier",
    fontSize: 7.5,
    color: "#0F7A6B",
    marginTop: 4,
  },
  qrBox: {
    width: 70,
    height: 70,
  },
  footerNote: {
    position: "absolute",
    bottom: 30,
    left: 60,
    right: 60,
    fontSize: 7.5,
    color: "#9CA3AF",
    textAlign: "center",
  },
});

export async function renderCertificatePdf(input: RenderInput): Promise<Buffer> {
  const verifyUrl = buildVerifyUrl(input.baseUrl, input.hash);
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 0,
    width: 200,
    color: { dark: "#15191E", light: "#FFFFFF" },
  });

  const hashBlockText = buildHashBlockText(input.hash, input.baseUrl);

  // Zeugnistext in Absätze splitten
  const paragraphs = input.bodyText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      // Briefkopf
      React.createElement(
        View,
        { style: styles.letterhead },
        React.createElement(
          View,
          {},
          React.createElement(Text, { style: styles.companyName }, input.companyName),
          input.companyAddress
            ? React.createElement(
                Text,
                { style: styles.companyAddress },
                input.companyAddress,
              )
            : null,
        ),
        input.companyLogoDataUrl
          ? React.createElement(Image, {
              src: input.companyLogoDataUrl,
              style: styles.logo,
            })
          : null,
      ),
      // Titel
      React.createElement(Text, { style: styles.title }, "ARBEITSZEUGNIS"),
      // Body
      React.createElement(
        View,
        { style: styles.body },
        ...paragraphs.map((p, i) =>
          React.createElement(Text, { key: i, style: styles.paragraph }, p),
        ),
      ),
      // Hash-Block + QR
      React.createElement(
        View,
        { style: styles.hashBlock },
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(Text, { style: styles.hashText }, hashBlockText),
          React.createElement(Text, { style: styles.hashValue }, input.hash),
        ),
        React.createElement(Image, { src: qrDataUrl, style: styles.qrBox }),
      ),
      // Footer
      React.createElement(
        Text,
        { style: styles.footerNote, fixed: true },
        `Erstellt mit zeugnix.ch · Echtheit prüfbar unter ${input.baseUrl}/verify`,
      ),
    ),
  );

  // @ts-ignore – Document ist ein React-Element
  const blob = await pdf(doc).toBuffer();
  return blob as unknown as Buffer;
}
