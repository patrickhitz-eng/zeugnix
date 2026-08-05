/**
 * zeugnix.ch – Design-Tokens -> @react-pdf-StyleSheet
 * ----------------------------------------------------------------------------
 * Baut das StyleSheet des Zeugnis-PDFs aus BASE_TOKENS und dem Theme. Server-
 * seitig (importiert @react-pdf/renderer); die HTML-Vorschau nutzt stattdessen
 * lib/design/document-css.ts aus denselben Tokens.
 *
 * StyleSheet.create akzeptiert nur Zahlen – Tokens sind bereits unitless pt,
 * es findet daher keine Konversion statt.
 */

import { StyleSheet } from "@react-pdf/renderer";
import { pdfFontName } from "@/lib/pdf/fonts";
import { BASE_TOKENS as T, type DocumentTheme } from "./document-tokens";

export function buildPdfStyles(theme: DocumentTheme) {
  const c = theme.colors;
  const headingRegular = pdfFontName(theme.fonts.heading, false, false);
  const headingBold = pdfFontName(theme.fonts.heading, true, false);
  const mono = pdfFontName(theme.fonts.mono, false, false);

  return StyleSheet.create({
    page: {
      paddingTop: T.page.paddingTop,
      paddingBottom: T.page.paddingBottom,
      paddingHorizontal: T.page.paddingHorizontal,
      // Dokument-Default. Der formatierte Body überschreibt pro Absatz mit
      // theme.fonts.body (siehe tiptap-to-pdf.tsx); der Plain-Text-Fallback
      // erbt bewusst diesen Wert – so war es vor der Token-Einführung auch.
      fontFamily: headingRegular,
      fontSize: T.fontSize.body,
      lineHeight: T.lineHeight.page,
      color: c.textPrimary,
    },

    letterhead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingBottom: T.space.letterheadPaddingBottom,
      borderBottomWidth: T.border.hairline,
      borderBottomColor: c.rule,
      marginBottom: T.space.letterheadMarginBottom,
    },
    letterheadLeft: { flex: 1 },
    logo: {
      maxWidth: T.logo.maxWidth,
      maxHeight: T.logo.maxHeight,
      objectFit: "contain",
    },
    companyNameNoLogo: {
      fontSize: T.fontSize.companyName,
      fontFamily: headingBold,
    },
    letterheadRight: {
      textAlign: "right",
      fontSize: T.fontSize.letterhead,
      color: c.textSecondary,
      lineHeight: T.lineHeight.letterhead,
      width: T.space.letterheadRightWidth,
    },
    letterheadCompanyName: {
      fontFamily: headingBold,
      color: c.textPrimary,
      marginBottom: T.space.letterheadCompanyNameMarginBottom,
    },

    title: {
      fontSize: T.fontSize.title,
      fontFamily: headingBold,
      // Titel trägt die Markenfarbe (Wunsch Christoph/Silvan, Call 2026-07-24):
      // im Standard-Theme das Petrol, in Marken-Themes die jeweilige Firmenfarbe.
      color: c.brandAccent,
      textAlign: "center",
      marginTop: T.space.titleMarginTop,
      marginBottom: T.space.titleMarginBottom,
      letterSpacing: T.letterSpacing.title,
    },

    bodyParagraph: {
      fontSize: T.fontSize.body,
      lineHeight: T.lineHeight.body,
      textAlign: "justify",
      marginBottom: T.space.paragraphMarginBottom,
    },
    bullet: {
      fontSize: T.fontSize.body,
      marginLeft: T.space.bulletMarginLeft,
      marginBottom: T.space.bulletMarginBottom,
    },
    // Unsichtbare Marker (weiss) zum Isolieren des gehashten Body beim Verify
    sentinel: {
      fontSize: T.fontSize.sentinel,
      color: c.paper,
      lineHeight: T.lineHeight.sentinel,
    },

    signaturesHeader: {
      fontFamily: headingBold,
      fontSize: T.fontSize.signaturesHeader,
      color: c.brandAccent,
      textTransform: "uppercase",
      letterSpacing: T.letterSpacing.label,
      marginTop: T.space.signaturesHeaderMarginTop,
      marginBottom: T.space.signaturesHeaderMarginBottom,
    },
    signatures: {
      flexDirection: "row",
      marginTop: T.space.signaturesMarginTop,
    },
    signatureCell: {
      flex: 1,
      paddingTop: T.space.signatureCellPaddingTop,
      borderTopWidth: T.border.signature,
      borderTopColor: c.signatureLine,
      fontSize: T.fontSize.signature,
    },
    signatureSpacer: { width: T.space.signatureSpacer },
    signatureName: { fontFamily: headingBold },
    signatureRole: {
      color: c.textMuted,
      marginTop: T.space.signatureRoleMarginTop,
      fontSize: T.fontSize.signatureRole,
    },
    signatureEmail: {
      color: c.textSecondary,
      marginTop: T.space.signatureEmailMarginTop,
      fontSize: T.fontSize.signatureEmail,
    },
    signatureConfirmed: {
      color: c.brandAccent,
      marginTop: T.space.signatureConfirmedMarginTop,
      fontSize: T.fontSize.hash,
      fontFamily: headingBold,
    },

    hashBlock: {
      marginTop: T.space.hashBlockMarginTop,
      paddingTop: T.space.hashBlockPaddingTop,
      borderTopWidth: T.border.hairline,
      borderTopColor: c.rule,
      flexDirection: "row",
    },
    hashText: {
      flex: 1,
      paddingRight: T.space.hashTextPaddingRight,
      fontSize: T.fontSize.hash,
      color: c.textSecondary,
      lineHeight: T.lineHeight.hash,
    },
    hashLabel: {
      fontFamily: headingBold,
      color: c.brandAccent,
      fontSize: T.fontSize.hashLabel,
      letterSpacing: T.letterSpacing.label,
      marginBottom: T.space.hashLabelMarginBottom,
    },
    hashValue: {
      fontFamily: mono,
      color: c.textPrimary,
      fontSize: T.fontSize.hash,
      marginBottom: T.space.hashValueMarginBottom,
    },
    hashLink: {
      marginTop: T.space.hashLinkMarginTop,
      color: c.brandAccent,
    },
    qrCode: { width: T.qr.size, height: T.qr.size },
  });
}
