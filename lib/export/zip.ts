/**
 * Kleiner ZIP-Schreiber für den Datenexport (Schritt 17).
 *
 * Warum selbst und nicht jszip/archiver: Ein neues Paket hätte die
 * package-lock.json berührt, und das ist hier heikel (lokal npm 11, Server
 * npm 10, siehe Lockfile-Falle). Das ZIP-Format für «Dateien hinein, fertig»
 * ist klein: pro Datei ein lokaler Kopf, die Daten, am Ende ein Verzeichnis.
 * Komprimiert wird mit zlib aus Node (Deflate, Methode 8). PDFs und Word-
 * Dateien sind schon komprimiert und werden darum nur abgelegt (Methode 0).
 *
 * Grenzen: kein ZIP64, also höchstens 65 535 Dateien und 4 GB. Für den Export
 * einer Firma reicht das weit.
 */
import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Pfad im Archiv, mit «/» als Trenner. */
  name: string;
  data: Buffer | string;
  /** false = ablegen ohne Komprimierung (für schon komprimierte Dateien). */
  compress?: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Datum und Zeit im MS-DOS-Format, wie ZIP sie erwartet. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function buildZip(entries: ZipEntry[], now = new Date()): Buffer {
  if (entries.length > 0xffff) throw new Error("Zu viele Dateien für ein ZIP ohne ZIP64.");
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data;
    const compress = entry.compress !== false;
    const stored = compress ? deflateRawSync(raw) : raw;
    const method = compress ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // Version zum Entpacken
    local.writeUInt16LE(0x0800, 6); // Bit 11: Dateiname in UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // erstellt mit
    central.writeUInt16LE(20, 6); // nötig zum Entpacken
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    // 30 Extra-Länge, 32 Kommentar, 34 Disk, 36 interne, 38 externe Attribute: 0
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + stored.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}
