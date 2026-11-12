/**
 * zeugnix.ch – Brücke zwischen Rich-Content (Tiptap-JSON) und Klartext
 * ----------------------------------------------------------------------------
 * Der Zeugnis-Body wird als Tiptap-JSON gespeichert (Schrift/Farbe/Fett pro
 * Textstelle). Der Echtheits-Hash hängt aber ausschliesslich an der
 * KLARTEXT-Projektion (`certificates.edited_text`). Diese Datei ist die EINZIGE
 * Quelle dieser Projektion und wird sowohl im Client (Anzeige/Speichern) als
 * auch server-autoritativ (Save-Route) verwendet – damit Formatierung den Hash
 * niemals verändert.
 *
 * WICHTIG (Hash-Invariante):
 *   - `tiptapToPlainText` darf aus Marks (bold/italic/color/fontFamily) NIE
 *     Zeichen ableiten – Formatierung fügt keinen Text hinzu.
 *   - Runs innerhalb eines Absatzes werden OHNE Trennzeichen konkateniert
 *     (sonst bräche `canonicalizeForHash`'s "-\s"-Regel Bindestrich-Wörter).
 *   - Bewusst KEIN `@tiptap/*`-Import: rein strukturell auf der JSON-Form, damit
 *     die Funktion auch in der serverlosen API-Route ohne ProseMirror läuft.
 *
 * Roundtrip-Garantie: `tiptapToPlainText(plainTextToTiptap(t)) === t` für den
 * von der Engine erzeugten `generated_text` (Absätze per \n\n, Aufgaben als
 * "• "-Bulletliste).
 */

// ----------------------------------------------------------------------------
// Minimale Tiptap-/ProseMirror-JSON-Typen (nur was wir brauchen)
// ----------------------------------------------------------------------------

export interface TiptapMark {
  type: string; // "bold" | "italic" | "underline" | "textStyle"
  attrs?: { color?: string; fontFamily?: string; [key: string]: unknown };
}

export interface TiptapNode {
  type: string; // "doc" | "paragraph" | "bulletList" | "listItem" | "text" | "hardBreak"
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export type TiptapDoc = TiptapNode; // type === "doc"

// ----------------------------------------------------------------------------
// JSON -> Klartext (die gehashte Projektion)
// ----------------------------------------------------------------------------

/** Konkateniert den reinen Text eines Inline-/Block-Knotens (Marks ignoriert). */
function inlineText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!node.content) return "";
  return node.content.map(inlineText).join("");
}

export function tiptapToPlainText(doc: TiptapNode | null | undefined): string {
  if (!doc || !doc.content) return "";

  const blocks: string[] = [];
  for (const node of doc.content) {
    if (node.type === "bulletList") {
      const lines: string[] = [];
      for (const item of node.content ?? []) {
        lines.push("• " + inlineText(item).trim());
      }
      if (lines.length > 0) blocks.push(lines.join("\n"));
    } else {
      // paragraph (und andere Block-Knoten): reiner Text der Inline-Kinder.
      const t = inlineText(node).trim();
      if (t.length > 0) blocks.push(t); // leere Absätze droppen
    }
  }
  return blocks.join("\n\n");
}

// ----------------------------------------------------------------------------
// Klartext -> JSON (Initialisierung aus generated_text)
// ----------------------------------------------------------------------------

const BULLET_RE = /^\s*•/;

function textParagraph(text: string): TiptapNode {
  const t = text.trim();
  return t.length > 0
    ? { type: "paragraph", content: [{ type: "text", text: t }] }
    : { type: "paragraph" };
}

/**
 * Baut ein Tiptap-Dokument aus reinem Text. Absätze werden an Leerzeilen
 * (\n\n) getrennt; ein Block, dessen Zeilen alle mit "•" beginnen, wird zur
 * bulletList. Kein Stil (keine Marks) – der Basis-Stil (Firmen-Default) wird
 * erst beim Rendern in Editor/Vorschau/PDF angewendet.
 */
export function plainTextToTiptap(text: string): TiptapDoc {
  const content: TiptapNode[] = [];
  const blocks = (text ?? "").split(/\n\n+/);

  for (const raw of blocks) {
    const block = raw.replace(/\s+$/, "");
    if (block.trim().length === 0) continue;

    const lines = block.split("\n");
    const isBullets = lines.every((l) => BULLET_RE.test(l));

    if (isBullets) {
      content.push({
        type: "bulletList",
        content: lines.map((l) => ({
          type: "listItem",
          content: [textParagraph(l.replace(/^\s*•\s*/, ""))],
        })),
      });
    } else {
      content.push(textParagraph(block));
    }
  }

  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

// ----------------------------------------------------------------------------
// Editor-Fassung gegen generierten Text
// ----------------------------------------------------------------------------

function hatMarks(node: TiptapNode): boolean {
  if (node.marks && node.marks.length > 0) return true;
  return (node.content ?? []).some(hatMarks);
}

/**
 * Weicht die Editor-Fassung vom generierten Text ab? «Neu generieren» fragt
 * dann nach, weil es die Editor-Fassung ersetzt.
 *
 * Verglichen wird der Klartext, nicht das JSON: Tiptap speichert dasselbe
 * Dokument je nach Weg leicht anders (z. B. leere `attrs`), und ein reiner
 * JSON-Vergleich würde dann grundlos nachfragen. Formatierungen zählen als
 * Abweichung, denn der generierte Text hat keine.
 */
export function weichtVomGeneriertenAb(
  doc: TiptapNode | null | undefined,
  generatedText: string,
): boolean {
  if (!doc) return false;
  if (hatMarks(doc)) return true;
  return tiptapToPlainText(doc) !== tiptapToPlainText(plainTextToTiptap(generatedText));
}
