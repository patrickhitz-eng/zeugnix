/**
 * zeugnix.ch – Design-Tokens -> inline-CSS der A4-Vorschau
 * ----------------------------------------------------------------------------
 * Gegenstück zu lib/design/document-pdf-styles.ts: dieselben Tokens, für die
 * HTML-Vorschau. Client-tauglich (kein @react-pdf-Import).
 *
 * Warum pt statt px: das Vorschau-Blatt ist physisch 210mm breit, und 210mm
 * sind exakt 595.28pt. Dieselbe pt-Zahl erzeugt daher in Vorschau und PDF
 * dieselbe Geometrie. px wären eine zweite, driftende Wahrheit.
 *
 * Das PDF ist die verbindliche Wahrheit (es ist das rechtlich relevante
 * Artefakt). Wo die Vorschau früher abwich – Zeilenhöhe 1.55 statt 1.6,
 * Seitenrand 20/22mm statt 56/60pt, Signaturfarbe #6b7178 statt #3a3f46,
 * fehlender Kopf "Digital ausgestellt durch" – folgt sie jetzt dem PDF.
 */

import type React from "react";
import { fontConfig } from "@/lib/pdf/fonts";
import {
  BASE_TOKENS as T,
  cssLh,
  cssMm,
  cssPt,
  type DocumentTheme,
} from "./document-tokens";

export interface DocumentCss {
  sheet: React.CSSProperties;
  letterhead: React.CSSProperties;
  letterheadRight: React.CSSProperties;
  letterheadCompanyName: React.CSSProperties;
  companyNameNoLogo: React.CSSProperties;
  logo: React.CSSProperties;
  title: React.CSSProperties;
  /** Plain-Text-Fallback: erbt die Blattschrift – wie styles.bodyParagraph im PDF. */
  bodyParagraph: React.CSSProperties;
  bullet: React.CSSProperties;
  dateParagraph: React.CSSProperties;
  /** Formatierter Body: trägt theme.fonts.body – wie tiptap-to-pdf.tsx. */
  formattedParagraph: React.CSSProperties;
  formattedBullet: React.CSSProperties;
  signaturesHeader: React.CSSProperties;
  signaturesWrap: React.CSSProperties;
  signatureCellLeft: React.CSSProperties;
  signatureCellRight: React.CSSProperties;
  signatureRule: React.CSSProperties;
  signatureName: React.CSSProperties;
  signatureRole: React.CSSProperties;
  hashBlock: React.CSSProperties;
  hashLabel: React.CSSProperties;
  hashValue: React.CSSProperties;
  qrCode: React.CSSProperties;
}

/** Halber Zwischenraum der Unterschriftszellen (PDF: ein 20pt-Spacer). */
const SIGNATURE_HALF_GAP = T.space.signatureSpacer / 2;

export function buildDocumentCss(theme: DocumentTheme): DocumentCss {
  const c = theme.colors;
  const headingCss = fontConfig(theme.fonts.heading).css;
  const bodyCss = fontConfig(theme.fonts.body).css;
  const monoCss = fontConfig(theme.fonts.mono).css;

  const paragraphBase: React.CSSProperties = {
    fontSize: cssPt(T.fontSize.body),
    lineHeight: cssLh(T.lineHeight.body),
    textAlign: "justify",
    margin: `0 0 ${cssPt(T.space.paragraphMarginBottom)} 0`,
  };
  const bulletBase: React.CSSProperties = {
    fontSize: cssPt(T.fontSize.body),
    lineHeight: cssLh(T.lineHeight.body),
    marginLeft: cssPt(T.space.bulletMarginLeft),
    marginBottom: cssPt(T.space.bulletMarginBottom),
  };

  return {
    // Blattgeometrie bleibt in mm – die Skalierung der Vorschau rechnet gegen
    // 210mm (A4_WIDTH ≈ 794px @96dpi). Nur die inneren Masse sind pt.
    sheet: {
      width: cssMm(T.page.widthMm),
      minHeight: cssMm(T.page.heightMm),
      paddingTop: cssPt(T.page.paddingTop),
      paddingBottom: cssPt(T.page.paddingBottom),
      paddingLeft: cssPt(T.page.paddingHorizontal),
      paddingRight: cssPt(T.page.paddingHorizontal),
      boxSizing: "border-box",
      fontFamily: headingCss,
      fontSize: cssPt(T.fontSize.body),
      lineHeight: cssLh(T.lineHeight.page),
      color: c.textPrimary,
    },

    letterhead: {
      width: "100%",
      borderBottom: `${cssPt(T.border.hairline)} solid ${c.rule}`,
      paddingBottom: cssPt(T.space.letterheadPaddingBottom),
      marginBottom: cssPt(T.space.letterheadMarginBottom),
    },
    letterheadRight: {
      verticalAlign: "top",
      textAlign: "right",
      fontSize: cssPt(T.fontSize.letterhead),
      color: c.textSecondary,
      lineHeight: cssLh(T.lineHeight.letterhead),
    },
    letterheadCompanyName: {
      fontWeight: 700,
      color: c.textPrimary,
      marginBottom: cssPt(T.space.letterheadCompanyNameMarginBottom),
    },
    companyNameNoLogo: {
      fontSize: cssPt(T.fontSize.companyName),
      fontWeight: 700,
    },
    logo: {
      maxHeight: cssPt(T.logo.maxHeight),
      maxWidth: cssPt(T.logo.maxWidth),
      objectFit: "contain",
      display: "block",
    },

    title: {
      fontSize: cssPt(T.fontSize.title),
      fontWeight: 700,
      // Titel in Markenfarbe – Gegenstück zu document-pdf-styles.ts.
      color: c.brandAccent,
      textAlign: "center",
      marginTop: cssPt(T.space.titleMarginTop),
      marginBottom: cssPt(T.space.titleMarginBottom),
      marginLeft: 0,
      marginRight: 0,
      letterSpacing: cssPt(T.letterSpacing.title),
    },

    bodyParagraph: paragraphBase,
    bullet: bulletBase,
    dateParagraph: {
      fontSize: cssPt(T.fontSize.body),
      lineHeight: cssLh(T.lineHeight.body),
      marginTop: cssPt(T.space.titleMarginBottom),
      marginBottom: cssPt(T.space.signaturesHeaderMarginBottom),
      textAlign: "left",
    },

    formattedParagraph: { ...paragraphBase, fontFamily: bodyCss },
    formattedBullet: { ...bulletBase, fontFamily: bodyCss },

    signaturesHeader: {
      fontWeight: 700,
      fontSize: cssPt(T.fontSize.signaturesHeader),
      color: c.brandAccent,
      textTransform: "uppercase",
      letterSpacing: cssPt(T.letterSpacing.label),
      marginTop: cssPt(T.space.signaturesHeaderMarginTop),
      marginBottom: cssPt(T.space.signaturesHeaderMarginBottom),
    },
    signaturesWrap: {
      width: "100%",
      marginTop: cssPt(T.space.signaturesMarginTop),
    },
    signatureCellLeft: {
      verticalAlign: "top",
      width: "50%",
      paddingRight: cssPt(SIGNATURE_HALF_GAP),
    },
    signatureCellRight: {
      verticalAlign: "top",
      width: "50%",
      paddingLeft: cssPt(SIGNATURE_HALF_GAP),
    },
    signatureRule: {
      borderTop: `${cssPt(T.border.signature)} solid ${c.signatureLine}`,
      paddingTop: cssPt(T.space.signatureCellPaddingTop),
      fontSize: cssPt(T.fontSize.signature),
    },
    signatureName: { fontWeight: 700 },
    signatureRole: {
      color: c.textMuted,
      marginTop: cssPt(T.space.signatureRoleMarginTop),
      fontSize: cssPt(T.fontSize.signatureRole),
    },

    hashBlock: {
      marginTop: cssPt(T.space.hashBlockMarginTop),
      paddingTop: cssPt(T.space.hashBlockPaddingTop),
      borderTop: `${cssPt(T.border.hairline)} solid ${c.rule}`,
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: cssPt(T.space.hashTextPaddingRight),
      fontSize: cssPt(T.fontSize.hash),
      color: c.textSecondary,
      lineHeight: cssLh(T.lineHeight.hash),
    },
    hashLabel: {
      fontSize: cssPt(T.fontSize.hashLabel),
      fontWeight: 700,
      color: c.brandAccent,
      textTransform: "uppercase",
      letterSpacing: cssPt(T.letterSpacing.label),
      marginBottom: cssPt(T.space.hashLabelMarginBottom),
    },
    hashValue: {
      fontFamily: monoCss,
      fontSize: cssPt(T.fontSize.hash),
      color: c.textPrimary,
      wordBreak: "break-all",
      marginBottom: cssPt(T.space.hashValueMarginBottom),
    },
    qrCode: {
      width: cssPt(T.qr.size),
      height: cssPt(T.qr.size),
      flexShrink: 0,
      display: "block",
    },
  };
}
