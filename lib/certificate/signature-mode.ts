/**
 * zeugnix.ch – Unterschrifts-Modus pro Zeugnis
 * ----------------------------------------------------------------------------
 * EINZIGE Quelle für die wählbaren Signatur-Modi. Geteilt von: Auswahl-UI
 * (SignatoryControls), Persistenz (signatory-Route), PDF-Renderer
 * (lib/pdf/certificate.tsx) und A4-Vorschau (certificate-preview.tsx).
 *
 * Der Modus steuert NUR den Unterschriftsblock (ob der Kopf „Digital
 * ausgestellt durch" erscheint). Er liegt ausserhalb des gehashten Bodys und
 * verändert den Echtheits-Hash daher nicht.
 *
 * ERWEITERBAR: für ein späteres elektronisches Siegel („zählt als Signatur")
 * hier einen Modus ergänzen, den CHECK in Migration 018 erweitern und den
 * Renderer/die Vorschau um die neue Kopfzeile ergänzen.
 */

export type SignatureMode = "digital" | "handwritten";

export const DEFAULT_SIGNATURE_MODE: SignatureMode = "digital";

export const SIGNATURE_MODES: {
  value: SignatureMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "digital",
    label: "Digital ausgestellt",
    hint: 'Zeigt den Hinweis „Digital ausgestellt durch" über den Unterzeichnenden.',
  },
  {
    value: "handwritten",
    label: "Von Hand unterschrieben",
    hint: "Ohne diesen Hinweis – Platz für die handschriftliche Unterschrift auf dem gedruckten Zeugnis.",
  },
];

export function isSignatureMode(v: unknown): v is SignatureMode {
  return v === "digital" || v === "handwritten";
}

/** Toleranter Fallback (null/unbekannt -> Default) für Render-Pfade. */
export function normalizeSignatureMode(v: unknown): SignatureMode {
  return isSignatureMode(v) ? v : DEFAULT_SIGNATURE_MODE;
}
