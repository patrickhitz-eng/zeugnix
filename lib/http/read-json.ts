/**
 * zeugnio – JSON-Body mit Obergrenze lesen
 * ----------------------------------------------------------------------------
 * `req.json()` liest den ganzen Body in den Speicher, egal wie gross. nginx
 * lässt auf advisori01 bis 64 MB durch. Für
 * öffentliche Routen ohne Konto ist das zu viel: Jede Anfrage hält sonst bis
 * 64 MB im Speicher der einen Node-Instanz.
 *
 * Darum hier in zwei Stufen:
 *   1. Nennt der Kopf `Content-Length` mehr als erlaubt, wird gar nicht erst
 *      gelesen.
 *   2. Sonst wird Stück für Stück gelesen und abgebrochen, sobald die Grenze
 *      überschritten ist. Das fängt auch Anfragen ohne Längenangabe
 *      (chunked) oder mit falscher Angabe.
 *
 * Ohne Next-Abhängigkeiten (nur der Web-Standard `Request`), damit
 * `npm run test:read-json` es direkt laden kann.
 */

export type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "zu_gross" | "ungueltig" };

export async function readJsonLimited(req: Request, maxBytes: number): Promise<ReadJsonResult> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) {
    return { ok: false, reason: "zu_gross" };
  }
  if (!req.body) return { ok: false, reason: "ungueltig" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "zu_gross" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "ungueltig" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: "ungueltig" };
  }
}
