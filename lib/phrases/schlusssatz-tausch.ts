/**
 * zeugnix.ch – Schlusssatz im bestehenden Zeugnistext tauschen
 * ----------------------------------------------------------------------------
 * Ändert jemand die Schlusssatz-Auswahl, soll das Zeugnis den neuen Satz sofort
 * zeigen, ohne dass Handänderungen am übrigen Text verloren gehen. Getauscht
 * wird darum nur, wenn der bisherige Satz unverändert im Text steht. Wurde er
 * von Hand angepasst (oder stammt er aus einer älteren Katalog-Fassung), bleibt
 * der Text, wie er ist, und die Steuerung zeigt einen Hinweis.
 *
 * Rein strukturell auf Strings bzw. Tiptap-JSON, damit es in der API-Route und
 * im Test ohne ProseMirror läuft.
 */

import type { TiptapNode } from "@/lib/certificate/tiptap-plaintext";

/** Ersetzt das erste Vorkommen von `alt` durch `neu`. */
export function tauscheImText(
  text: string,
  alt: string,
  neu: string,
): string | null {
  const i = text.indexOf(alt);
  if (!alt || i < 0) return null;
  return text.slice(0, i) + neu + text.slice(i + alt.length);
}

function inlineText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

/**
 * Tauscht den Satz im Tiptap-Dokument. Zuerst in einem einzelnen Textknoten
 * (Formatierung bleibt erhalten); steht der Satz allein in einem Absatz, aber
 * über mehrere Knoten verteilt (z. B. teils fett), wird der Absatz zu einem
 * Knoten mit der Formatierung des ersten Teils. Gibt null zurück, wenn der Satz
 * nicht gefunden wurde.
 */
export function tauscheImDoc(
  doc: TiptapNode,
  alt: string,
  neu: string,
): TiptapNode | null {
  if (!alt) return null;
  const kopie: TiptapNode = structuredClone(doc);
  let getauscht = false;

  const besuche = (node: TiptapNode) => {
    if (getauscht || !node.content) return;
    for (const kind of node.content) {
      if (kind.type === "text" && kind.text?.includes(alt)) {
        kind.text = tauscheImText(kind.text, alt, neu)!;
        getauscht = true;
        return;
      }
    }
    if (node.type === "paragraph" && inlineText(node).trim() === alt) {
      const erster = node.content.find((k) => k.type === "text");
      node.content = [{ type: "text", text: neu, ...(erster?.marks ? { marks: erster.marks } : {}) }];
      getauscht = true;
      return;
    }
    for (const kind of node.content) besuche(kind);
  };

  besuche(kopie);
  return getauscht ? kopie : null;
}
