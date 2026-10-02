import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Firmenlogos auf der Platte statt im Supabase-Storage.
 *
 * Bisher lud der Browser das Logo direkt in einen öffentlichen Supabase-Bucket
 * und schrieb die öffentliche Adresse in companies.logo_url. Beim Umzug auf den
 * eigenen Server fällt dieser Bucket weg. Die Logos landen stattdessen in einem
 * Verzeichnis neben der Anwendung, das ein Deployment nicht anfasst, und werden
 * über /api/logos/… ausgeliefert.
 *
 * Zwei Dinge werden dabei besser, unabhängig vom Serverstandort:
 *
 *  1. Die Prüfung von Dateityp und Grösse findet endlich auf dem Server statt.
 *     Bisher stand sie nur im Browser (company-form.tsx) – wer den Upload
 *     nachbaute, konnte beliebige Dateien in den öffentlichen Bucket legen.
 *     Geprüft wird hier nicht die vom Browser gemeldete Art, sondern die ersten
 *     Bytes der Datei: der Content-Type ist frei wählbar, die Signatur nicht.
 *
 *  2. Die PDF-Route liest das Logo danach von der Platte statt es über das Netz
 *     zu holen. Damit entfällt für neue Logos die Allowlist, die verhindern
 *     musste, dass eine manipulierte logo_url den Server zu einer beliebigen
 *     internen Adresse schickt.
 */

/** Grenze wie bisher im Formular. nginx muss client_max_body_size mindestens so hoch haben. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Adresse, unter der Logos ausgeliefert werden. Steht so in companies.logo_url. */
export const LOGO_URL_PREFIX = "/api/logos/";

/** Erlaubte Bildarten. SVG bleibt bewusst aus: @react-pdf stellt es nicht dar. */
const SIGNATURES: { ext: "png" | "jpg"; mime: string; matches: (b: Buffer) => boolean }[] = [
  {
    ext: "png",
    mime: "image/png",
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    // JPEG beginnt mit FF D8 FF; das vierte Byte unterscheidet die Varianten.
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
];

/**
 * Bestimmt die Bildart aus den ersten Bytes. Gibt null zurück, wenn es weder
 * PNG noch JPEG ist – dann wird die Datei nicht gespeichert.
 */
export function sniffImageType(bytes: Buffer): { ext: "png" | "jpg"; mime: string } | null {
  for (const candidate of SIGNATURES) {
    if (candidate.matches(bytes)) return { ext: candidate.ext, mime: candidate.mime };
  }
  return null;
}

/** Wurzelverzeichnis der Uploads. Muss ausserhalb der Release-Ordner liegen. */
export function uploadRoot(): string {
  const configured = process.env.ZEUGNIO_UPLOAD_DIR?.trim();
  if (configured) return configured;
  // Entwicklungsfall: neben dem Projekt, damit lokal nichts zusätzlich einzurichten ist.
  return path.join(process.cwd(), ".uploads");
}

export function logoDir(companyId: string): string {
  return path.join(uploadRoot(), "logos", companyId);
}

/** Neuer, nicht erratbarer Dateiname. Der Zeitstempel hilft beim Aufräumen von Hand. */
export function newLogoFileName(ext: "png" | "jpg"): string {
  return `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
}

/** Ist das eine von uns ausgelieferte Adresse (und nicht eine alte Supabase-Adresse)? */
export function isLocalLogoUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(LOGO_URL_PREFIX);
}

// companyId ist eine UUID, der Dateiname stammt aus newLogoFileName. Beides wird
// beim Ausliefern erneut geprüft und nicht nur beim Schreiben: die Adresse in
// logo_url kann von jedem geändert werden, der die Firma bearbeiten darf.
const SEGMENT_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FILE_PATTERN = /^[0-9]+-[0-9a-f]{16}\.(png|jpg)$/;

/**
 * Wandelt die Pfadteile aus /api/logos/<companyId>/<datei> in einen absoluten
 * Pfad um – oder gibt null zurück.
 *
 * Es wird nicht versucht, einen unsauberen Pfad zu retten. Zwei Muster, beide
 * eng, und danach zur Sicherheit noch die Prüfung, dass das Ergebnis wirklich
 * unter dem Wurzelverzeichnis liegt: ein einzelnes ".." in einem Segment würde
 * sonst genügen, um beliebige Dateien des Servers auszuliefern.
 */
export function resolveLogoPath(segments: string[]): string | null {
  if (segments.length !== 2) return null;
  const [companyId, fileName] = segments;
  if (!SEGMENT_PATTERN.test(companyId)) return null;
  if (!FILE_PATTERN.test(fileName)) return null;

  const root = path.resolve(uploadRoot(), "logos");
  const resolved = path.resolve(root, companyId, fileName);
  if (resolved !== path.join(root, companyId, fileName)) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** Aus companies.logo_url die Pfadteile gewinnen, für die PDF-Route. */
export function segmentsFromLogoUrl(url: string): string[] | null {
  if (!isLocalLogoUrl(url)) return null;
  const rest = url.slice(LOGO_URL_PREFIX.length).split("?")[0];
  const segments = rest.split("/").filter(Boolean);
  return segments.length === 2 ? segments : null;
}

export function contentTypeForFile(fileName: string): string {
  return fileName.endsWith(".png") ? "image/png" : "image/jpeg";
}
