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
  // Seitenränder. Gemessen am Ziel „einseitiges Zeugnis als Normalfall":
  // 42pt oben / 48pt unten entsprechen 14.8mm / 16.9mm und bleiben damit
  // deutlich über dem, was ein Drucker als Nicht-Druckbereich beansprucht
  // (üblich 5–10mm). Der Unterrand ist der grössere der beiden, weil die
  // Fusszeile darin sitzt (space.footerBottom).
  page: {
    widthMm: 210,
    heightMm: 297,
    paddingTop: 42 as Pt,
    paddingBottom: 48 as Pt,
    paddingHorizontal: 60 as Pt,
  },

  /**
   * Rollen, nicht Werte: `title` ist der Zeugnistitel, nicht "16pt".
   *
   * Der Fliesstext steht auf 10.5pt – eine halbe Stufe unter den früheren 11pt.
   * Die Grenze nach unten setzt nicht die Lesbarkeit, sondern die Zeilenlänge:
   * bei 60pt Seitenrand ist das Satzband 475pt breit, was bei 10.5pt rund 85
   * Zeichen je Zeile ergibt. Typografisch angenehm sind 60–80; eine weitere
   * Verkleinerung macht die Zeilen LÄNGER und das Dokument schlechter lesbar,
   * nicht besser. 10.5pt ist daher bewusst die Untergrenze, nicht ein Zwischen-
   * schritt auf dem Weg zu 10pt.
   */
  fontSize: {
    title: 16 as Pt,
    companyName: 13 as Pt,
    body: 10.5 as Pt,
    signature: 10 as Pt,
    signatureRole: 9 as Pt,
    letterhead: 8 as Pt,
    signaturesHeader: 8 as Pt,
    signatureEmail: 8 as Pt,
    hash: 7.5 as Pt,
    hashLabel: 7 as Pt,
    footer: 7.5 as Pt,
    /**
     * Unsichtbare Verifikations-Marker (weiss auf Papierweiss). Sie werden nie
     * gelesen, belegten aber als Fliesstext echte Zeilenhöhe: bei 6pt kosteten
     * Body-Sentinels plus Meta- und Signatur-Block zusammen rund 60pt, also
     * knapp vier Textzeilen für Text, den niemand sieht. 4pt ändert nichts an
     * der Extrahierbarkeit – die Schriftgrösse steht im Inhaltsstrom neben dem
     * Text, nicht in ihm – und das belegt scripts/test-pdf-roundtrip.ts, das
     * den Hash durch ein echt erzeugtes PDF zurückrechnet. NICHT weiter
     * verkleinern, ohne diesen Test laufen zu lassen.
     */
    sentinel: 4 as Pt,
  },

  /**
   * Fliesstext 1.4 statt 1.5 (20.11.2026, Ziel: das typische Zeugnis mit elf
   * Beurteilungssätzen bleibt einseitig). 10.5pt × 1.4 = 14.7pt Zeilenabstand,
   * also immer noch deutlich mehr Durchschuss als Words Standard (≈ 1.2). Bei
   * ~85 Zeichen je Zeile ist 1.4 die vernünftige Untergrenze: lange Zeilen
   * brauchen Luft, damit das Auge die nächste Zeile findet.
   */
  lineHeight: {
    page: 1.4,
    body: 1.4,
    letterhead: 1.3,
    hash: 1.4,
    /**
     * Der Titel ist eine einzelne Zeile; er braucht die Durchschusshöhe des
     * Fliesstexts nicht. Ohne eigenen Wert erbte er lineHeight.page und zog
     * eine über 9pt höhere Zeilenbox auf, als die Schrift verlangt.
     */
    title: 1.2,
    sentinel: 1,
  },

  letterSpacing: {
    title: 0.5 as Pt,
    label: 0.6 as Pt,
  },

  /**
   * Abstände. Die Werte von Briefkopf, Titel, Unterschriftskopf und Hash-Block
   * wurden gegenüber dem ersten Entwurf deutlich verdichtet: dort belegte das
   * Gerüst (Briefkopf + Titel + Unterschriften + Hash) rund 70% einer A4-Seite,
   * wodurch ein Zeugnis selbst mit sehr kurzem Text nie einseitig blieb.
   * Gemessen mit scripts/render-sample-certificate.ts --kapazitaet.
   */
  space: {
    letterheadPaddingBottom: 8 as Pt,
    /**
     * Trennlinie → Titel. Zusammen mit titleMarginTop 14pt statt früher 28pt:
     * der Titel gehört zum Text, nicht zum Briefkopf, und ein grosser Abstand
     * zur Linie liess ihn verloren in der Fläche stehen (Rückmeldung Silvan,
     * 20.11.2026).
     */
    letterheadMarginBottom: 10 as Pt,
    /**
     * Breite der Kontaktspalte. 240pt (statt 200pt) fassen eine gebündelte
     * Zeile «Telefon · E-Mail» bei 8pt ohne Umbruch (rund 54 Zeichen); das Logo
     * links hat mit 140pt trotzdem Luft.
     */
    letterheadRightWidth: 240 as Pt,
    letterheadCompanyNameMarginBottom: 2 as Pt,

    titleMarginTop: 4 as Pt,
    titleMarginBottom: 14 as Pt,

    paragraphMarginBottom: 8 as Pt,
    bulletMarginLeft: 14 as Pt,
    bulletMarginBottom: 3 as Pt,

    /**
     * Ort/Datum → «Digital ausgestellt durch» → Linie. 20/10 statt 14/6
     * (27.11.2026): Seit der Echtheitsnachweis fix in der Fusszeile steht,
     * endet der Textfluss mit dem Unterschriftsblock, und der Platz, den der
     * Hash dort belegte, gehört jetzt der Luft um die Unterschriften. Vorher
     * stapelten sich Datum, Kopf, Namen und Hash eng übereinander
     * (Rückmeldung Silvan: «zusammengequetscht»).
     */
    signaturesHeaderMarginTop: 20 as Pt,
    /**
     * Handschriftliche Unterschrift: Freiraum ÜBER der Unterschriftslinie
     * (ersetzt den entfallenden Kopf „Digital ausgestellt durch").
     *
     * 48pt sind 17mm. Eine Unterschrift mit Stift wird selten über 15mm hoch;
     * DIN 5008 sieht im Geschäftsbrief drei Leerzeilen (rund 13mm) vor. Die
     * Vorbilder aus Mobbin (Bonsai, Remote, Gusto) setzen die Unterschrift
     * ebenso direkt auf die Linie, mit zwei bis drei Zeilenhöhen Luft darüber,
     * und Name/Funktion darunter. Die früheren 72pt (25mm) plus 20pt Abstand
     * kosteten eine halbe Spalte Text und schoben ein typisches Zeugnis auf
     * die zweite Seite. Den Abstand zum Ort/Datum gibt schon der Absatzabstand
     * darüber; signatureHandwrittenMarginTop ist nur noch eine kleine Zugabe.
     */
    signatureHandwrittenMarginTop: 6 as Pt,
    signatureHandwrittenHeight: 48 as Pt,
    signaturesHeaderMarginBottom: 10 as Pt,
    signaturesMarginTop: 2 as Pt,
    signatureCellPaddingTop: 5 as Pt,
    signatureSpacer: 20 as Pt,
    signatureRoleMarginTop: 1 as Pt,
    signatureEmailMarginTop: 1 as Pt,
    signatureConfirmedMarginTop: 3 as Pt,

    // Echtheitsnachweis. Steht seit 27.11.2026 fix in der Fusszeile, mit
    // fester Höhe (verification.height), statt am Ende des Textflusses. Die
    // Abstände innen sind so knapp gewählt, dass Label, Hash, zwei Zeilen
    // Erklärung und Prüflink in die Höhe des QR-Codes (56pt) passen:
    // 9.8 + 2 + 10.5 + 2 + 21 + 1 + 10.5 = 56.8pt.
    hashBlockPaddingTop: 8 as Pt,
    hashTextPaddingRight: 16 as Pt,
    hashLabelMarginBottom: 2 as Pt,
    hashValueMarginBottom: 2 as Pt,
    hashLinkMarginTop: 1 as Pt,

    // Fussbereich: Abstand vom unteren Blattrand, Innenabstand über der
    // Trennlinie der Firmen-Fusszeile, Abstand Echtheitsnachweis → Firmen-
    // Fusszeile und Mindestabstand Textfluss → Fussbereich. Wie viel Unterrand
    // die Seite daraus braucht, rechnet footerReserve() unten.
    footerBottom: 16 as Pt,
    footerPaddingTop: 6 as Pt,
    verificationToFooterGap: 6 as Pt,
    bodyToFooterGap: 14 as Pt,
  },

  border: {
    hairline: 0.5 as Pt,
    signature: 0.6 as Pt,
  },

  // Logo. Die Höhe des Briefkopfs ist max(Logo, Kontaktspalte). Seit die
  // Kontaktangaben gebündelt sind (lib/design/letterhead-lines.ts: Name plus
  // höchstens drei Zeilen, rund 44pt), sind Logo (42pt) und Spalte praktisch
  // gleich hoch: der Briefkopf ist so niedrig, wie das Logo es erlaubt.
  logo: { maxWidth: 140 as Pt, maxHeight: 42 as Pt },
  qr: { size: 56 as Pt },

  /**
   * Echtheitsnachweis in der Fusszeile: feste Höhe, damit er wie das Logo
   * immer dieselbe Grösse und Lage hat (Wunsch Silvan, 27.11.2026). Trennlinie
   * + Innenabstand (8pt) + QR-Code (56pt) + 2pt Reserve für die Textspalte.
   */
  verification: { height: 66 as Pt },
} as const;

/**
 * Unterrand der Seite, damit der fixe Fussbereich (Echtheitsnachweis und
 * Firmen-Fusszeile) nie den Textfluss überlappt. Beide Teile stehen absolut
 * am unteren Blattrand; der Text darf nur bis zur Oberkante des Fussbereichs
 * plus bodyToFooterGap laufen.
 *
 * Eine Rechnung für PDF und Vorschau, damit beide an derselben Stelle umbrechen.
 * Nie kleiner als page.paddingBottom.
 *
 * Beispiel mit Hash und einer Fusszeilen-Zeile:
 *   16 + 66 + 6 + (6 + 10.5) + 14 = 118.5pt.
 * Früher: 48pt Unterrand + Hash-Block im Textfluss (12 + 66) = 126pt.
 * Ein einseitiges Zeugnis hat also eher mehr Platz als vorher.
 */
export function footerReserve(opts: { verification: boolean; footerLines: number }): Pt {
  const T = BASE_TOKENS;
  const lines = Math.max(0, opts.footerLines);
  const company = lines > 0 ? T.space.footerPaddingTop + lines * T.fontSize.footer * T.lineHeight.hash : 0;
  const verification = opts.verification
    ? T.verification.height + (lines > 0 ? T.space.verificationToFooterGap : 0)
    : 0;
  const content = company + verification;
  if (content === 0) return T.page.paddingBottom;
  return Math.max(T.page.paddingBottom, T.space.footerBottom + content + T.space.bodyToFooterGap);
}

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
    label: "Zeugnio Standard (Inter)",
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
  "brand-prokuration": {
    id: "brand-prokuration",
    label: "Prokuration",
    fonts: { heading: "inter", body: "inter", mono: "inter" },
    colors: { ...BASE_COLORS, brandAccent: "#2278C9" },
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
export function resolveTheme(value?: string | null, accent?: string | null): DocumentTheme {
  const base = resolveBaseTheme(value);
  // Eigene Akzentfarbe der Mastervorlage (companies.brand_accent, Migration 034).
  // Gilt nur, wenn sie lesbar ist: die API lässt keine blasse Farbe durch, aber
  // ein per SQL gesetzter Wert soll das Dokument nicht unlesbar machen können.
  // Marken-Themes behalten ihre kuratierte Farbe.
  if (!accent || base.id in BRAND_THEMES || !isReadableAccent(accent)) return base;
  return { ...base, colors: { ...base.colors, brandAccent: normalizeHex(accent) } };
}

function resolveBaseTheme(value?: string | null): DocumentTheme {
  if (!value) return DEFAULT_THEME;
  const legacy = LEGACY_FONT_TO_THEME[value];
  return ALL_THEMES[value] ?? (legacy ? BUILTIN_THEMES[legacy] : undefined) ?? DEFAULT_THEME;
}

export function resolveThemeFromCompany(company: {
  default_certificate_font_family?: string | null;
  brand_accent?: string | null;
}): DocumentTheme {
  return resolveTheme(company.default_certificate_font_family, company.brand_accent);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Eine eigene Akzentfarbe ist zulässig, wenn sie ein 6-stelliger Hex-Wert ist
 * und gegen Papierweiss WCAG AA erreicht – dieselbe Grenze wie für die
 * kuratierten Themes (assertThemeReadable).
 */
export function isReadableAccent(value: string): boolean {
  const hex = value.trim();
  if (!HEX_COLOR.test(hex)) return false;
  return contrastRatio(hex, BASE_COLORS.paper) >= WCAG_AA_NORMAL_TEXT;
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
