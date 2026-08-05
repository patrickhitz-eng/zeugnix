/**
 * zeugnix.ch – Design-Tokens für das Zeugnis-Dokument
 * ----------------------------------------------------------------------------
 * EINZIGE Quelle der Wahrheit für die Typografie des A4-Zeugnisses. Vorher lagen
 * dieselben Literale dreifach verstreut in lib/pdf/certificate.tsx,
 * lib/pdf/tiptap-to-pdf.tsx und components/app/certificate-preview.tsx.
 *
 * GELTUNGSBEREICH: nur das Dokument (PDF + A4-Vorschau). Die Anwendungs-
 * oberfläche (tailwind.config.ts, Inter Tight/petrol) ist bewusst NICHT hier.
 *
 * EINHEITEN: alle Grössen sind unitless Points – das native Mass von
 * @react-pdf (StyleSheet.create akzeptiert nur Zahlen). Die HTML-Vorschau
 * konvertiert über cssPt(). Da das Vorschau-Blatt physisch 210mm breit ist und
 * 210mm exakt 595.28pt entspricht, ergeben identische pt-Werte in beiden Welten
 * dieselbe Geometrie.
 *
 * GRENZEN (der Punkt an einem Designsystem): BASE_TOKENS ist unveränderlich.
 * Ein DocumentTheme darf ausschliesslich `fonts` und `colors` setzen – nie
 * Schriftgrössen, Zeilenhöhen oder Abstände. Das ist vom Typsystem erzwungen,
 * nicht von einer Konvention.
 */

import type { FontKey } from "@/lib/pdf/fonts";

export const PT_PER_MM = 72 / 25.4;

/** Unitless Points. */
export type Pt = number;

// ---------------------------------------------------------------------------
// Einheiten-Adapter
// ---------------------------------------------------------------------------

/** Point-Wert für inline-CSS der HTML-Vorschau. */
export const cssPt = (v: Pt): string => `${v}pt`;
/** Millimeter-Wert für inline-CSS (Blattgeometrie). */
export const cssMm = (v: number): string => `${v}mm`;
/** lineHeight bleibt in beiden Welten unitless. */
export const cssLh = (v: number): string => String(v);

// ---------------------------------------------------------------------------
// Unveränderliche Basis-Tokens
// ---------------------------------------------------------------------------

export const BASE_TOKENS = {
  page: {
    widthMm: 210,
    heightMm: 297,
    paddingTop: 56 as Pt,
    paddingBottom: 60 as Pt,
    paddingHorizontal: 60 as Pt,
  },

  /** Rollen, nicht Werte: `title` ist der Zeugnistitel, nicht "18pt". */
  fontSize: {
    title: 18 as Pt,
    companyName: 14 as Pt,
    body: 11 as Pt,
    signature: 10 as Pt,
    signatureRole: 9 as Pt,
    letterhead: 8.5 as Pt,
    signaturesHeader: 8 as Pt,
    signatureEmail: 8 as Pt,
    hash: 7.5 as Pt,
    hashLabel: 7 as Pt,
    sentinel: 6 as Pt,
  },

  lineHeight: {
    page: 1.55,
    body: 1.6,
    letterhead: 1.45,
    hash: 1.5,
    sentinel: 1,
  },

  letterSpacing: {
    title: 0.5 as Pt,
    label: 0.6 as Pt,
  },

  space: {
    letterheadPaddingBottom: 14 as Pt,
    letterheadMarginBottom: 28 as Pt,
    letterheadRightWidth: 200 as Pt,
    letterheadCompanyNameMarginBottom: 2 as Pt,

    titleMarginTop: 24 as Pt,
    titleMarginBottom: 32 as Pt,

    paragraphMarginBottom: 11 as Pt,
    bulletMarginLeft: 14 as Pt,
    bulletMarginBottom: 3 as Pt,

    signaturesHeaderMarginTop: 36 as Pt,
    signaturesHeaderMarginBottom: 8 as Pt,
    signaturesMarginTop: 4 as Pt,
    signatureCellPaddingTop: 6 as Pt,
    signatureSpacer: 20 as Pt,
    signatureRoleMarginTop: 1 as Pt,
    signatureEmailMarginTop: 1 as Pt,
    signatureConfirmedMarginTop: 3 as Pt,

    hashBlockMarginTop: 36 as Pt,
    hashBlockPaddingTop: 12 as Pt,
    hashTextPaddingRight: 16 as Pt,
    hashLabelMarginBottom: 3 as Pt,
    hashValueMarginBottom: 4 as Pt,
    hashLinkMarginTop: 3 as Pt,
  },

  border: {
    hairline: 0.5 as Pt,
    signature: 0.6 as Pt,
  },

  logo: { maxWidth: 140 as Pt, maxHeight: 48 as Pt },
  qr: { size: 56 as Pt },
} as const;

// ---------------------------------------------------------------------------
// Theme = Schriften + Farben. Sonst nichts.
// ---------------------------------------------------------------------------

export interface DocumentColors {
  /** Fliesstext, Titel, Unterschriftsnamen. */
  textPrimary: string;
  /** Briefkopf-Adresse, Hash-Fliesstext, E-Mail der Unterzeichner. */
  textSecondary: string;
  /** Funktion der Unterzeichner. */
  textMuted: string;
  /** Markenfarbe: Titel, Signatur-Header, Labels, Bestätigungen, Verify-Link.
   *  (NICHT der QR-Code – der ist bewusst schwarz/weiss für besten Scan-Kontrast.) */
  brandAccent: string;
  /** Trennlinien (Briefkopf, Hash-Block). */
  rule: string;
  /** Unterschriftslinie. */
  signatureLine: string;
  /** Papier – Referenz für den Kontrast-Check. */
  paper: string;
}

export interface DocumentTheme {
  /** Stabiler Key; wird in companies.default_certificate_font_family abgelegt. */
  id: string;
  label: string;
  fonts: {
    /** Titel, Briefkopf, Unterschriftsnamen, Labels. */
    heading: FontKey;
    /** Fliesstext des Zeugnisses. */
    body: FontKey;
    /** Prüfhash. */
    mono: FontKey;
  };
  colors: DocumentColors;
}

const BASE_COLORS: DocumentColors = {
  textPrimary: "#1a1d22",
  textSecondary: "#6b7178",
  textMuted: "#3a3f46",
  brandAccent: "#0f7a6b",
  rule: "#d4d8dd",
  signatureLine: "#1a1d22",
  paper: "#ffffff",
};

/**
 * Built-in-Themes. Alle lizenzfrei: der Standard nutzt die eingebettete
 * Hausschrift Inter (OFL, keine Lizenzkosten), Serif/Mono nutzen die in PDF
 * eingebauten Basisschriften (Times/Courier).
 *
 * Die Serif-/Mono-Varianten existieren, damit Bestandsfirmen, die früher `times`
 * oder `courier` gewählt hatten, ihren gewohnten Fliesstext behalten (bewusst
 * NICHT auf Inter umgestellt). Ihr `heading` bleibt "helvetica" wie bisher.
 *
 * Eine echte Marke (z.B. First Advisory) ist ein Eintrag in BRAND_THEMES.
 */
export const BUILTIN_THEMES: Record<string, DocumentTheme> = {
  "zeugnix-standard": {
    id: "zeugnix-standard",
    label: "Zeugnix Standard (Inter)",
    // Durchgängig Inter (Titel, Fliesstext UND Prüf-Hash) für ein einheitliches
    // Schriftbild – bewusste Entscheidung gegen Monospace beim Hash.
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: BASE_COLORS,
  },
  "zeugnix-serif": {
    id: "zeugnix-serif",
    label: "Serif (Times im Fliesstext)",
    fonts: { heading: "helvetica", body: "times", mono: "courier" },
    colors: BASE_COLORS,
  },
  "zeugnix-mono": {
    id: "zeugnix-mono",
    label: "Monospace (Courier im Fliesstext)",
    fonts: { heading: "helvetica", body: "courier", mono: "courier" },
    colors: BASE_COLORS,
  },
};

/**
 * Private Mandanten-Themes (Whitelabeling). BEWUSST NICHT in BUILTIN_THEMES und
 * damit NICHT im öffentlichen Theme-Picker (company-form.tsx). Eine Firma erhält
 * ihr Marken-Theme ausschliesslich durch Setzen der Theme-ID in
 * companies.default_certificate_font_family (manuelles SQL im Prod-Editor) – kein
 * Self-Service, kein durchstöberbarer Katalog. resolveTheme() liest trotzdem aus
 * der Vereinigung beider Maps, damit eine gesetzte ID auflöst.
 *
 * Jedes Theme erbt BASE_COLORS und überschreibt NUR `brandAccent` (Titel,
 * Signatur-Header, Bestätigungshäkchen, Hash-Label/Verify-Link). Der QR-Code ist
 * bewusst schwarz/weiss (Scan-Kontrast), der Fliesstext neutral-schwarz für
 * maximale Lesbarkeit. Farbwerte: Christoph Senn,
 * 2026-07-20; alle ≥ 4.5:1 gegen Papierweiss (WCAG AA, per test-themes.ts geprüft).
 * Durchgängig Inter (Titel, Fliesstext, Hash) für ein einheitliches Schriftbild.
 */
export const BRAND_THEMES: Record<string, DocumentTheme> = {
  "brand-first": {
    id: "brand-first",
    label: "First Advisory",
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: { ...BASE_COLORS, brandAccent: "#003867" },
  },
  "brand-csl": {
    id: "brand-csl",
    label: "CSL",
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: { ...BASE_COLORS, brandAccent: "#A44A52" },
  },
  "brand-c2g": {
    id: "brand-c2g",
    label: "Comply2gether",
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: { ...BASE_COLORS, brandAccent: "#D10800" },
  },
  "brand-iab": {
    id: "brand-iab",
    label: "IAB",
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: { ...BASE_COLORS, brandAccent: "#002D53" },
  },
};

/** Vereinigung: alle auflösbaren Themes (öffentlich + privat). */
const ALL_THEMES: Record<string, DocumentTheme> = {
  ...BUILTIN_THEMES,
  ...BRAND_THEMES,
};

export const DEFAULT_THEME_ID = "zeugnix-standard";
export const DEFAULT_THEME: DocumentTheme = BUILTIN_THEMES[DEFAULT_THEME_ID];

/** Alt-Werte der Spalte `default_certificate_font_family` -> Theme-ID. */
const LEGACY_FONT_TO_THEME: Record<string, string> = {
  helvetica: "zeugnix-standard",
  times: "zeugnix-serif",
  courier: "zeugnix-mono",
};

/**
 * Versteht sowohl eine Theme-ID als auch einen Alt-FontKey. Dadurch braucht es
 * für die Einführung der Themes keine DB-Migration: die bestehende Spalte hält
 * künftig die Theme-ID, alte Zeilen halten weiter 'helvetica'|'times'|'courier'.
 */
export function resolveTheme(value?: string | null): DocumentTheme {
  if (!value) return DEFAULT_THEME;
  const legacy = LEGACY_FONT_TO_THEME[value];
  return ALL_THEMES[value] ?? (legacy ? BUILTIN_THEMES[legacy] : undefined) ?? DEFAULT_THEME;
}

export function resolveThemeFromCompany(company: {
  default_certificate_font_family?: string | null;
}): DocumentTheme {
  return resolveTheme(company.default_certificate_font_family);
}

// ---------------------------------------------------------------------------
// Kontrast (WCAG 2.1)
// ---------------------------------------------------------------------------

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Kein 6-stelliger Hex-Farbwert: "${hex}"`);
  const n = parseInt(m[1], 16);
  const r = channelLuminance((n >> 16) & 0xff);
  const g = channelLuminance((n >> 8) & 0xff);
  const b = channelLuminance(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG-Kontrastverhältnis zweier Farben, 1:1 bis 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA für Fliesstext. Alle mit brandAccent gesetzten Labels sind < 18pt. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

/**
 * Prüft ein Theme gegen WCAG AA. Der Check schützt den Theme-Autor, nicht den
 * Endnutzer – Themes sind kuratierte Daten, kein User-Freitext.
 *
 * Läuft über scripts/test-themes.ts, das als `prebuild`-Skript vor jedem
 * `npm run build` ausgeführt wird: ein Theme mit zu blasser Markenfarbe bricht
 * den Build ab. Eine Grenze, die kein Build prüft, wäre keine Grenze.
 */
export function assertThemeReadable(theme: DocumentTheme): void {
  const { paper } = theme.colors;
  const checked: Array<keyof DocumentColors> = [
    "textPrimary",
    "textSecondary",
    "textMuted",
    "brandAccent",
  ];
  const failed = checked
    .map((key) => ({ key, ratio: contrastRatio(theme.colors[key], paper) }))
    .filter(({ ratio }) => ratio < WCAG_AA_NORMAL_TEXT);

  if (failed.length > 0) {
    const detail = failed
      .map(({ key, ratio }) => `${key} ${ratio.toFixed(2)}:1`)
      .join(", ");
    throw new Error(
      `Theme "${theme.id}" verletzt WCAG AA (< ${WCAG_AA_NORMAL_TEXT}:1 gegen Papier): ${detail}`,
    );
  }
}
