/**
 * zeugnix.ch – Minimale Bildgrössen-Erkennung für den Word-Export
 * ----------------------------------------------------------------------------
 * Word (docx ImageRun) verlangt explizite Breite/Höhe in Pixeln – anders als das
 * PDF, das mit objectFit "contain" automatisch skaliert. Diese Funktion liest die
 * Pixelmasse direkt aus dem Datei-Header (PNG und JPEG, die einzigen im Logo-
 * Upload erlaubten Formate, siehe components/forms/company-form.tsx). Bewusst
 * ohne Zusatzbibliothek – nur ein Header-Parse.
 *
 * Fällt die Erkennung aus (unerwartetes/kaputtes Bild), gibt sie ein neutrales
 * Standardmass zurück; der Aufrufer passt es ohnehin in eine feste Box ein.
 */

const FALLBACK = { width: 160, height: 64 };

function pngSize(buf: Buffer): { width: number; height: number } | null {
  // PNG-Signatur (8 Byte) + IHDR: Breite @16, Höhe @20 (uint32 big-endian).
  if (buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  // JPEG beginnt mit FFD8. Danach Segmente abklappern bis zu einem SOF-Marker
  // (0xC0–0xCF ohne die Nicht-SOF-Marker C4/C8/CC), der Höhe/Breite enthält.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF-Marker mit Massangaben.
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    // Segmentlänge (2 Byte nach dem Marker) überspringen.
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) return null;
    offset += 2 + segLen;
  }
  return null;
}

export function imageSizePx(data: Buffer, type: "png" | "jpg"): { width: number; height: number } {
  try {
    const size = type === "png" ? pngSize(data) : jpegSize(data);
    return size ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}
