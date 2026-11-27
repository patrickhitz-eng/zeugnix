/**
 * zeugnio – Grössengrenzen der öffentlichen Prüfung (/api/verify, /api/analyze)
 * ----------------------------------------------------------------------------
 * Die Prüfseite zieht den Text im Browser aus dem PDF und schickt ihn als
 * JSON `{ text }`. Ein einseitiges Zeugnis (12–13 Sätze) ergibt samt Kopf, Meta- und Signaturblock wenige
 * tausend Zeichen, auch ein mehrseitiges bleibt im niedrigen Zehntausender-
 * Bereich. 200 000 Zeichen lassen also ein Vielfaches Luft und schneiden kein
 * echtes Zeugnis ab.
 *
 * Die Byte-Grenze greift vor dem Parsen: 200 000 Zeichen mit Umlauten und
 * JSON-Maskierung bleiben deutlich unter 1 MB.
 */
export const MAX_VERIFY_TEXT_CHARS = 200_000;
export const MAX_VERIFY_BODY_BYTES = 1_000_000;

/** Der QR-Weg schickt nur `{ hash }` mit 64 Zeichen. */
export const MAX_VERIFY_HASH_BODY_BYTES = 4_096;

export const VERIFY_TEXT_TOO_LONG =
  "Der Text ist zu lang für eine Prüfung. Bitte laden Sie das Zeugnis-PDF hoch, wie Sie es von zeugnio erhalten haben.";
