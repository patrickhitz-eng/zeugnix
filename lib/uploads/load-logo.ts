/**
 * zeugnix.ch – Firmenlogo für die Dokument-Renderer laden
 * ----------------------------------------------------------------------------
 * EINZIGE Quelle der Wahrheit dafür, WIE ein Logo aus companies.logo_url zu
 * Bytes wird. Vorher stand diese Logik nur in der PDF-Route; die später
 * entstandene Word-Route (PR #28) hatte einen Zweig nicht mitbekommen, und im
 * Word-Export erschien kein Logo. Zwei Kopien derselben Entscheidung driften;
 * eine nicht.
 *
 * Logos liegen lokal (`/api/logos/<companyId>/<datei>`, siehe
 * lib/uploads/logos.ts). Es wird nichts über das Netz geholt, sondern eine
 * Datei gelesen, deren Pfad zwei engen Mustern entsprechen muss – die
 * SSRF-Frage stellt sich gar nicht.
 *
 * Bis B2 gab es einen zweiten Weg für Logos, die noch als Adresse im
 * Supabase-Storage in der Spalte standen. Seit Cutover A liegen alle Logos auf
 * der Platte («noch auf Supabase: 0», 20.11.2026), und der Bucket ist gelöscht.
 * Eine andere Adresse in logo_url wird darum übersprungen, nie abgerufen.
 *
 * Ein Problem beim Logo überspringt IMMER nur das Logo und bricht nie die
 * Dokumenterzeugung ab: ein Zeugnis ohne Logo ist brauchbar, keines nicht.
 */

import { readFile } from "node:fs/promises";

import {
  contentTypeForFile,
  resolveLogoPath,
  segmentsFromLogoUrl,
} from "@/lib/uploads/logos";

/** Geladenes Logo: rohe Bytes plus die Art, auf die sich der Renderer stützt. */
export interface LoadedLogo {
  bytes: Buffer;
  /** "image/png" oder "image/jpeg". */
  contentType: string;
}

/**
 * Obergrenze für das, was in ein Dokument eingebettet wird. Absichtlich höher
 * als MAX_LOGO_BYTES des Uploads (2 MB): hier wird auch Bestand von früher
 * gelesen, der nie durch diese Prüfung lief.
 */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

async function loadLocalLogo(segments: string[]): Promise<LoadedLogo | null> {
  const file = resolveLogoPath(segments);
  if (!file) {
    console.warn("Logo-Pfad nicht zulässig, wird übersprungen");
    return null;
  }
  try {
    const bytes = await readFile(file);
    if (bytes.byteLength > MAX_LOGO_BYTES) {
      console.warn("Logo übersprungen: Datei überschreitet Limit:", bytes.byteLength);
      return null;
    }
    return { bytes, contentType: contentTypeForFile(file) };
  } catch {
    // Fehlende Datei ist kein Grund, das Zeugnis nicht zu erzeugen – es entsteht
    // dann ohne Logo, wie bei einer Firma, die keines hinterlegt hat.
    console.warn("Logo-Datei nicht lesbar, wird übersprungen");
    return null;
  }
}

/**
 * Lädt das Firmenlogo von der Platte. Gibt null zurück, wenn kein Logo
 * hinterlegt ist, die Adresse keine eigene ist oder die Datei nicht gelesen
 * werden konnte – Aufrufer rendern dann ohne Logo.
 */
export async function loadCompanyLogo(
  logoUrl: string | null | undefined,
): Promise<LoadedLogo | null> {
  if (!logoUrl) return null;
  const localSegments = segmentsFromLogoUrl(logoUrl);
  if (!localSegments) {
    console.warn("Logo-Adresse ist keine eigene (/api/logos/…), wird übersprungen");
    return null;
  }
  return loadLocalLogo(localSegments);
}

/** Data-URL für @react-pdf (<Image src="data:…">). */
export function toDataUrl(logo: LoadedLogo): string {
  return `data:${logo.contentType};base64,${logo.bytes.toString("base64")}`;
}
