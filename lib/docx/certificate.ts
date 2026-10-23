/**
 * zeugnix.ch – Word-Generator (.docx)
 * ----------------------------------------------------------------------------
 * Erzeugt das Arbeitszeugnis als Word-Datei – als zweiter Ausgabekanal NEBEN dem
 * PDF (lib/pdf/certificate.tsx). Beide lesen denselben Body (Tiptap-JSON über
 * tiptapToBlocks) und dieselben Design-Tokens, damit sie denselben Text mit
 * denselben Formatierungen zeigen.
 *
 * Zweck (Wunsch Christoph, Call 2026-10-07): Aussteller, die das Zeugnis in Word
 * weiterbearbeiten wollen, erhalten eine bearbeitbare Datei statt den Text von
 * Hand aus dem PDF herauszukopieren.
 *
 * UNTERSCHIEDE ZUM PDF (bewusst):
 *  - Keine unsichtbaren Verifikations-Sentinels. Sie dienen allein dazu, beim
 *    Prüfen den gehashten Body aus dem extrahierten PDF-Text zu isolieren. Eine
 *    Word-Datei ist bearbeitbar und nie das massgebliche Prüf-Artefakt – das
 *    bleibt das PDF auf zeugnio.ch. Der sichtbare Hash-Block verweist weiterhin
 *    auf die Prüfseite.
 *  - Mono-Schnitt und Markenschriften können auf dem Zielrechner fehlen; Word
 *    ersetzt sie dann. Das ist für eine Arbeitskopie akzeptabel.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  Footer,
  AlignmentType,
  BorderStyle,
  WidthType,
  VerticalAlign,
} from "docx";
import QRCode from "qrcode";
import { tiptapToBlocks, type Run } from "@/lib/certificate/tiptap-runs";
import type { TiptapDoc } from "@/lib/certificate/tiptap-plaintext";
import {
  resolveTheme,
  BASE_TOKENS as T,
  type DocumentTheme,
} from "@/lib/design/document-tokens";
import type { FontKey } from "@/lib/pdf/fonts";
import { buildVerifyUrl } from "@/lib/hash/canonicalize";
import { imageSizePx } from "@/lib/docx/image-size";

export interface DocxLogo {
  data: Buffer;
  type: "png" | "jpg";
}

export interface DocxRenderInput {
  companyName: string;
  companyAddress?: string;
  companyPostalCode?: string;
  companyCity?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyFooter?: string;
  companyLogo?: DocxLogo | null;

  employeeFirstName: string;
  employeeLastName: string;

  certificateTitle: string;
  bodyText: string;
  formattedContent?: TiptapDoc | null;
  themeId?: string;

  signatory1Name?: string;
  signatory1Role?: string;
  signatory1Email?: string;
  signatory1ConfirmedAt?: string;
  signatory2Name?: string;
  signatory2Role?: string;
  signatory2Email?: string;
  signatory2ConfirmedAt?: string;
  signatureMode?: string;

  hash: string;
  baseUrl: string;
}

// --- Einheiten -------------------------------------------------------------
// Word rechnet in Twips (1 pt = 20 twip) bzw. halben Punkten (Schriftgrösse).
const pt = (v: number): number => Math.round(v * 20);
const halfPt = (v: number): number => Math.round(v * 2);
/**
 * Bildmasse gibt docx in Pixeln bei 96 dpi an, die Tokens stehen in Points
 * (72 dpi). Ohne diese Umrechnung driften Logo und QR-Code zwischen PDF und
 * Word – vorher standen hier die Festwerte 160x64 bzw. 74.
 */
const ptToPx = (v: number): number => Math.round((v * 96) / 72);
/**
 * Zeilenabstand. Mit dem Standard-lineRule "auto" zählt Word in 240steln einer
 * Zeile: 240 = einfach. Ein Faktor 1.5 wird also zu 360.
 */
const lineOf = (factor: number): number => Math.round(factor * 240);
/** Buchstabenabstand (letterSpacing) in Twips – wie `pt`, nur für Zeichen. */
const spacingOf = (v: number): number => Math.round(v * 20);

// Theme-FontKey -> auf dem Zielrechner übliche Schrift. Fehlt sie, ersetzt Word.
function docxFont(key: FontKey): string {
  switch (key) {
    case "times":
      return "Times New Roman";
    case "courier":
      return "Courier New";
    default:
      return "Inter";
  }
}

/** "#0f7a6b" -> "0F7A6B"; ungültige Werte -> undefined (Default-Farbe greift). */
function hex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return m ? m[1].toUpperCase() : undefined;
}

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function formatConfirmation(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("de-CH");
    const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    return "✓ Bestätigt am " + date + " um " + time;
  } catch {
    return "✓ Bestätigt";
  }
}

// --- Body: Tiptap-Blöcke / Plain-Text -> Word-Absätze ----------------------

function runToTextRun(run: Run, theme: DocumentTheme, fontName: string): TextRun {
  return new TextRun({
    text: run.text,
    bold: run.bold,
    // Kursiv ist im Zeugnis unzulässig (siehe tiptap-runs.ts) – nie gesetzt.
    underline: run.underline ? {} : undefined,
    color: hex(run.color) ?? hex(theme.colors.textPrimary),
    font: fontName,
  });
}

function bodyParagraphs(input: DocxRenderInput, theme: DocumentTheme): Paragraph[] {
  const fontName = docxFont(theme.fonts.body);
  const blocks = tiptapToBlocks(input.formattedContent ?? null);

  // Formatierter Body, falls vorhanden – sonst Plain-Text-Fallback (wie im PDF).
  if (blocks.length > 0) {
    return blocks.map((block) => {
      const children = block.runs.map((r) => runToTextRun(r, theme, fontName));
      if (block.type === "bullet") {
        return new Paragraph({
          bullet: { level: 0 },
          spacing: { after: pt(T.space.bulletMarginBottom) },
          children,
        });
      }
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: pt(T.space.paragraphMarginBottom), line: lineOf(T.lineHeight.body) },
        children,
      });
    });
  }

  // Fallback: Klartext in Absätze splitten (identisch zum PDF-Fallback).
  const paragraphs = s(input.bodyText)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs.flatMap((p) => {
    const lines = p.split("\n");

    // Einzeiliger Absatz: Blocksatz wie im PDF.
    if (lines.length === 1) {
      return [
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: pt(T.space.paragraphMarginBottom), line: lineOf(T.lineHeight.body) },
          children: [new TextRun({ text: p, font: fontName })],
        }),
      ];
    }

    // Mehrzeiliger Absatz – in der Praxis die Aufgaben-Aufzählung, die der
    // Generator mit einfachen Umbrüchen zu EINEM Abschnitt verbindet.
    //
    // Zwei Fallen auf einmal: Word ignoriert ein "\n" innerhalb eines TextRun
    // (das PDF rendert es als Umbruch), weshalb die Aufzählung vorher zu einer
    // einzigen Zeile zusammenlief. Und eine Zeile, die mit einem HARTEN
    // Umbruch endet, zieht Word im Blocksatz über die volle Breite auseinander
    // – bei einer natürlich umbrochenen Zeile tut es das nicht. Deshalb wird
    // jede Zeile ein eigener, linksbündiger Absatz; der Abstand nach unten ist
    // innerhalb der Aufzählung eng und nur nach der letzten Zeile voll.
    return lines.map(
      (line, i) =>
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: {
            after: pt(
              i === lines.length - 1
                ? T.space.paragraphMarginBottom
                : T.space.bulletMarginBottom,
            ),
            line: lineOf(T.lineHeight.body),
          },
          children: [new TextRun({ text: line, font: fontName })],
        }),
    );
  });
}

// --- Briefkopf -------------------------------------------------------------

/**
 * Briefkopf als randlose Zwei-Spalten-Tabelle: Logo (oder Firmenname) links,
 * Adresse rechtsbündig rechts – genau die Anordnung, die das PDF mit einer
 * Flex-Zeile erzeugt.
 *
 * Vorher standen Logo, Firmenname und Adresszeilen hier UNTEREINANDER. Das sah
 * nicht nur anders aus als das PDF, es kostete auch die ganze Logo-Höhe
 * zusätzlich: gestapelt addieren sich beide Blöcke, nebeneinander zählt nur der
 * höhere von beiden.
 */
function letterhead(input: DocxRenderInput, theme: DocumentTheme): (Paragraph | Table)[] {
  const headingFont = docxFont(theme.fonts.heading);
  const out: (Paragraph | Table)[] = [];

  // --- linke Spalte: Logo, sonst der Firmenname gross ---
  const leftChildren: Paragraph[] = [];
  if (input.companyLogo) {
    const { width, height } = imageSizePx(input.companyLogo.data, input.companyLogo.type);
    // In die Logo-Box der Tokens einpassen, Seitenverhältnis erhalten und nie
    // hochskalieren (ein kleines Logo soll klein bleiben, nicht unscharf gross).
    const boxW = ptToPx(T.logo.maxWidth);
    const boxH = ptToPx(T.logo.maxHeight);
    const scale = Math.min(boxW / (width || boxW), boxH / (height || boxH), 1);
    leftChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: input.companyLogo.type,
            data: input.companyLogo.data,
            transformation: {
              width: Math.max(1, Math.round((width || boxW) * scale)),
              height: Math.max(1, Math.round((height || boxH) * scale)),
            },
          }),
        ],
      }),
    );
  } else {
    leftChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: s(input.companyName),
            bold: true,
            size: halfPt(T.fontSize.companyName),
            font: headingFont,
            color: hex(theme.colors.textPrimary),
          }),
        ],
      }),
    );
  }

  // --- rechte Spalte: Firmenname (nur wenn links das Logo steht) + Adresse ---
  const rightChildren: Paragraph[] = [];
  const smallLine = (
    text: string,
    opts: { bold?: boolean; color?: string; after?: number } = {},
  ) =>
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: pt(opts.after ?? 0), line: lineOf(T.lineHeight.letterhead) },
      children: [
        new TextRun({
          text,
          bold: opts.bold,
          size: halfPt(T.fontSize.letterhead),
          font: headingFont,
          color: hex(opts.color ?? theme.colors.textSecondary),
        }),
      ],
    });

  if (input.companyLogo) {
    rightChildren.push(
      smallLine(s(input.companyName), {
        bold: true,
        color: theme.colors.textPrimary,
        after: T.space.letterheadCompanyNameMarginBottom,
      }),
    );
  }

  const cityLine = [s(input.companyPostalCode), s(input.companyCity)]
    .filter((x) => x.length > 0)
    .join(" ");
  const contactLines = [
    s(input.companyAddress),
    cityLine,
    s(input.companyPhone),
    s(input.companyEmail),
    s(input.companyWebsite),
  ].filter((x) => x.length > 0);
  for (const line of contactLines) rightChildren.push(smallLine(line));

  if (rightChildren.length === 0) rightChildren.push(new Paragraph({ children: [] }));

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.TOP,
              borders: noBorders,
              children: leftChildren,
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.TOP,
              borders: noBorders,
              children: rightChildren,
            }),
          ],
        }),
      ],
    }),
  );

  // Eigener Trennabsatz mit Linie unten = Trennlinie unter dem Briefkopf.
  out.push(
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: hex(theme.colors.rule) ?? "D4D8DD",
          space: 4,
        },
      },
      spacing: {
        before: pt(T.space.letterheadPaddingBottom),
        after: pt(T.space.letterheadMarginBottom),
      },
      children: [],
    }),
  );

  return out;
}

// --- Unterschriften --------------------------------------------------------

function signatureCell(name: string, role: string, email: string, confirmed: string, theme: DocumentTheme): TableCell {
  const headingFont = docxFont(theme.fonts.heading);
  const children: Paragraph[] = [];
  if (name) children.push(new Paragraph({ children: [new TextRun({ text: name, bold: true, font: headingFont, size: halfPt(T.fontSize.signature) })] }));
  if (role)
    children.push(
      new Paragraph({ spacing: { before: pt(1) }, children: [new TextRun({ text: role, font: headingFont, size: halfPt(T.fontSize.signatureRole), color: hex(theme.colors.textMuted) })] }),
    );
  if (email)
    children.push(
      new Paragraph({ spacing: { before: pt(1) }, children: [new TextRun({ text: email, font: headingFont, size: halfPt(T.fontSize.signatureEmail), color: hex(theme.colors.textSecondary) })] }),
    );
  if (confirmed)
    children.push(
      new Paragraph({ spacing: { before: pt(3) }, children: [new TextRun({ text: confirmed, bold: true, font: headingFont, size: halfPt(T.fontSize.hash), color: hex(theme.colors.brandAccent) })] }),
    );
  if (children.length === 0) children.push(new Paragraph({ children: [] }));
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: pt(T.space.signatureCellPaddingTop), right: pt(10) },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: hex(theme.colors.signatureLine) ?? "1A1D22" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    children,
  });
}

function signatures(input: DocxRenderInput, theme: DocumentTheme): (Paragraph | Table)[] {
  const name1 = s(input.signatory1Name);
  const name2 = s(input.signatory2Name);
  if (!name1 && !name2) return [];

  const headingFont = docxFont(theme.fonts.heading);
  const isHandwritten = input.signatureMode === "handwritten";
  const out: (Paragraph | Table)[] = [];

  if (isHandwritten) {
    // Platz zum handschriftlichen Unterschreiben über der Linie – dieselbe
    // Fläche wie im PDF (styles.signatureHandwrittenSpace).
    out.push(
      new Paragraph({
        spacing: {
          before: pt(T.space.signatureHandwrittenMarginTop),
          after: pt(T.space.signatureHandwrittenHeight),
        },
        children: [],
      }),
    );
  } else {
    out.push(
      new Paragraph({
        spacing: { before: pt(T.space.signaturesHeaderMarginTop), after: pt(T.space.signaturesHeaderMarginBottom) },
        children: [
          new TextRun({
            text: "DIGITAL AUSGESTELLT DURCH",
            bold: true,
            size: halfPt(T.fontSize.signaturesHeader),
            characterSpacing: spacingOf(T.letterSpacing.label),
            font: headingFont,
            color: hex(theme.colors.brandAccent),
          }),
        ],
      }),
    );
  }

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      rows: [
        new TableRow({
          children: [
            signatureCell(
              name1,
              s(input.signatory1Role),
              s(input.signatory1Email),
              input.signatory1ConfirmedAt ? formatConfirmation(input.signatory1ConfirmedAt) : "",
              theme,
            ),
            signatureCell(
              name2,
              s(input.signatory2Role),
              s(input.signatory2Email),
              input.signatory2ConfirmedAt ? formatConfirmation(input.signatory2ConfirmedAt) : "",
              theme,
            ),
          ],
        }),
      ],
    }),
  );

  return out;
}

// --- Hash-Block ------------------------------------------------------------

async function hashBlock(input: DocxRenderInput, theme: DocumentTheme): Promise<(Paragraph | Table)[]> {
  const hashFont = docxFont(theme.fonts.mono);
  const bodyFont = docxFont(theme.fonts.body);
  const verifyUrl = buildVerifyUrl(input.baseUrl, input.hash);
  const verifyLabel = "Echtheit prüfen: " + s(input.baseUrl).replace(/^https?:\/\//, "") + "/verify";

  // QR-Code als PNG-Puffer, schwarz/weiss für besten Scan-Kontrast (wie PDF).
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    margin: 0,
    width: 200,
    color: { dark: theme.colors.textPrimary, light: theme.colors.paper },
  });

  const textChildren: Paragraph[] = [
    new Paragraph({
      spacing: { after: pt(T.space.hashLabelMarginBottom) },
      children: [
        new TextRun({
          text: "ECHTHEITSNACHWEIS (SHA-256)",
          bold: true,
          size: halfPt(T.fontSize.hashLabel),
          characterSpacing: spacingOf(T.letterSpacing.label),
          font: bodyFont,
          color: hex(theme.colors.brandAccent),
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: pt(T.space.hashValueMarginBottom) },
      children: [new TextRun({ text: s(input.hash), font: hashFont, size: halfPt(T.fontSize.hash), color: hex(theme.colors.textPrimary) })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Dieses Arbeitszeugnis wurde mit zeugnio.ch erstellt und mit einem kryptografischen Echtheitsnachweis versehen. Jede nachträgliche Veränderung des Inhalts führt zu einem abweichenden Hash.",
          size: halfPt(T.fontSize.hash),
          font: bodyFont,
          color: hex(theme.colors.textSecondary),
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: pt(T.space.hashLinkMarginTop) },
      children: [new TextRun({ text: verifyLabel, size: halfPt(T.fontSize.hash), font: bodyFont, color: hex(theme.colors.brandAccent) })],
    }),
  ];

  const qrPx = ptToPx(T.qr.size);
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: hex(theme.colors.rule) ?? "D4D8DD" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 82, type: WidthType.PERCENTAGE },
            margins: { top: pt(T.space.hashBlockPaddingTop), right: pt(T.space.hashTextPaddingRight) },
            verticalAlign: VerticalAlign.TOP,
            children: textChildren,
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            margins: { top: pt(T.space.hashBlockPaddingTop) },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new ImageRun({ type: "png", data: qrPng, transformation: { width: qrPx, height: qrPx } })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Abstand oberhalb des Hash-Blocks (wie hashBlockMarginTop im PDF).
  return [new Paragraph({ spacing: { before: pt(T.space.hashBlockMarginTop) }, children: [] }), table];
}

// --- Fusszeile (Word-Section-Footer) ---------------------------------------

function buildFooter(input: DocxRenderInput, theme: DocumentTheme): Footer | undefined {
  const lines = s(input.companyFooter)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return undefined;

  const bodyFont = docxFont(theme.fonts.body);
  return new Footer({
    children: lines.map(
      (line, i) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          // Trennlinie nur über der ersten Zeile.
          border:
            i === 0
              ? { top: { style: BorderStyle.SINGLE, size: 4, color: hex(theme.colors.rule) ?? "D4D8DD", space: 4 } }
              : undefined,
          children: [new TextRun({ text: line, size: halfPt(T.fontSize.footer), font: bodyFont, color: hex(theme.colors.textSecondary) })],
        }),
    ),
  });
}

// --- Dokument --------------------------------------------------------------

export async function renderCertificateDocx(input: DocxRenderInput): Promise<Buffer> {
  const theme = resolveTheme(input.themeId);
  const headingFont = docxFont(theme.fonts.heading);
  const bodyFont = docxFont(theme.fonts.body);

  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      before: pt(T.space.titleMarginTop),
      after: pt(T.space.titleMarginBottom),
      line: lineOf(T.lineHeight.title),
    },
    children: [
      new TextRun({
        text: s(input.certificateTitle),
        bold: true,
        size: halfPt(T.fontSize.title),
        // Buchstabenabstand wie im PDF (letterSpacing.title).
        characterSpacing: spacingOf(T.letterSpacing.title),
        font: headingFont,
        color: hex(theme.colors.brandAccent),
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    ...letterhead(input, theme),
    title,
    ...bodyParagraphs(input, theme),
    ...signatures(input, theme),
    ...(await hashBlock(input, theme)),
  ];

  const footer = buildFooter(input, theme);

  const doc = new Document({
    creator: "zeugnio.ch",
    title: `${s(input.certificateTitle)} – ${s(input.employeeFirstName)} ${s(input.employeeLastName)}`,
    styles: {
      default: {
        document: {
          run: { font: bodyFont, size: halfPt(T.fontSize.body), color: hex(theme.colors.textPrimary) },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: pt(T.page.paddingTop),
              right: pt(T.page.paddingHorizontal),
              bottom: pt(T.page.paddingBottom),
              left: pt(T.page.paddingHorizontal),
            },
          },
        },
        footers: footer ? { default: footer } : undefined,
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as unknown as Buffer;
}
