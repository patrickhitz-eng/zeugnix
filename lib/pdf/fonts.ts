/**
 * zeugnix.ch – Schrift-Registry für den Zeugnis-Editor
 * ----------------------------------------------------------------------------
 * Eine einzige Quelle der Wahrheit für die wählbaren Schriftarten, geteilt von
 * Editor-Toolbar, HTML-Vorschau (CSS) und PDF (@react-pdf-Fontnamen).
 *
 * "inter" ist die eingebettete Hausschrift (Inter, OFL-lizenziert): TTFs in
 * public/fonts/, registriert via Font.register in certificate.tsx (PDF) und als
 * @font-face in app/globals.css (Vorschau). Die drei @react-pdf-Standardfonts
 * (Helvetica/Times/Courier) bleiben als eingebaute Fallbacks bestehen – für sie
 * ist kein Embedding nötig.
 *
 * Im Tiptap-JSON wird als fontFamily der stabile `key` gespeichert (nicht der
 * CSS- oder PDF-Name), damit Vorschau und PDF deterministisch daraus ableiten.
 */

export type FontKey = "inter" | "helvetica" | "times" | "courier";

export interface FontConfig {
  key: FontKey;
  label: string;
  /** @react-pdf-Fontnamen (eingebaut, keine Registrierung nötig). */
  pdf: { regular: string; bold: string; italic: string; boldItalic: string };
  /** CSS-Font-Stack für die HTML-Vorschau/den Editor. */
  css: string;
}

export const CERTIFICATE_FONTS: FontConfig[] = [
  {
    key: "inter",
    label: "Inter",
    // Eingebettet: family-Namen müssen mit Font.register in certificate.tsx
    // übereinstimmen. Zwei getrennte Familien (Inter / Inter-Bold) – analog zum
    // Helvetica/Helvetica-Bold-Muster. Kursiv ist im Zeugnis unzulässig, daher
    // fallen italic/boldItalic bewusst auf die aufrechten Schnitte zurück.
    pdf: {
      regular: "Inter",
      bold: "Inter-Bold",
      italic: "Inter",
      boldItalic: "Inter-Bold",
    },
    css: '"Inter", Arial, Helvetica, sans-serif',
  },
  {
    key: "helvetica",
    label: "Helvetica / Arial",
    pdf: {
      regular: "Helvetica",
      bold: "Helvetica-Bold",
      italic: "Helvetica-Oblique",
      boldItalic: "Helvetica-BoldOblique",
    },
    css: "Arial, Helvetica, sans-serif",
  },
  {
    key: "times",
    label: "Times (Serif)",
    pdf: {
      regular: "Times-Roman",
      bold: "Times-Bold",
      italic: "Times-Italic",
      boldItalic: "Times-BoldItalic",
    },
    css: '"Times New Roman", Times, serif',
  },
  {
    key: "courier",
    label: "Courier (Monospace)",
    pdf: {
      regular: "Courier",
      bold: "Courier-Bold",
      italic: "Courier-Oblique",
      boldItalic: "Courier-BoldOblique",
    },
    css: '"Courier New", Courier, monospace',
  },
];

export const DEFAULT_FONT_KEY: FontKey = "inter";
export const DEFAULT_TEXT_COLOR = "#1a1d22";

/**
 * Liefert die Font-Konfig zu einem Wert. Akzeptiert sowohl den Key
 * ('helvetica') als auch den CSS-Stack ('"Times New Roman", Times, serif'),
 * da der Editor den CSS-Stack als fontFamily-Mark speichert, der Firmen-Default
 * aber den Key. Fallback: Helvetica.
 */
export function fontConfig(value?: string | null): FontConfig {
  if (!value) return CERTIFICATE_FONTS[0];
  return (
    CERTIFICATE_FONTS.find((f) => f.key === value || f.css === value) ??
    CERTIFICATE_FONTS[0]
  );
}

/**
 * Wählt den passenden PDF-Fontnamen je nach Fett/Kursiv.
 *
 * ACHTUNG bei echten (lizenzpflichtigen) Schriften: Der Zeugnis-Renderer ruft
 * `italic` immer mit `false` auf – Kursiv ist im Arbeitszeugnis unzulässig
 * (siehe lib/certificate/tiptap-runs.ts). Pro Familie werden daher nur
 * `regular` und `bold` tatsächlich gebraucht. Bei den drei eingebauten
 * Standardschriften kosten die Kursivschnitte nichts, deshalb bleiben sie hier
 * stehen; eine neu lizenzierte Marke braucht sie NICHT zu beschaffen.
 */
export function pdfFontName(key: string | undefined, bold: boolean, italic: boolean): string {
  const cfg = fontConfig(key);
  if (bold && italic) return cfg.pdf.boldItalic;
  if (bold) return cfg.pdf.bold;
  if (italic) return cfg.pdf.italic;
  return cfg.pdf.regular;
}
