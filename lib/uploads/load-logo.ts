/**
 * zeugnix.ch – Firmenlogo für die Dokument-Renderer laden
 * ----------------------------------------------------------------------------
 * EINZIGE Quelle der Wahrheit dafür, WIE ein Logo aus companies.logo_url zu
 * Bytes wird. Vorher stand diese Logik nur in der PDF-Route; die später
 * entstandene Word-Route (PR #28) hatte den zweiten, entfernten Zweig nicht
 * mitbekommen und begann ihre Logo-Behandlung bei `if (localLogo)`. Ergebnis:
 * Solange die Logos noch als Supabase-Storage-Adresse in der Spalte stehen –
 * also bis zum CH-Cutover der Normalfall – erschien im Word-Export NIE ein
 * Logo, im PDF immer. Zwei Kopien derselben Entscheidung driften; eine nicht.
 *
 * ZWEI HERKÜNFTE, bewusst in dieser Reihenfolge:
 *
 *  1. Lokal (`/api/logos/<companyId>/<datei>`, siehe lib/uploads/logos.ts).
 *     Seit dem Umzug der Zielzustand. Es wird nichts über das Netz geholt,
 *     sondern eine Datei gelesen, deren Pfad zwei engen Mustern entsprechen
 *     muss – die SSRF-Frage stellt sich hier gar nicht.
 *
 *  2. Entfernt (Supabase-Storage). Bestand aus der Zeit vor dem Umzug, solange
 *     nicht alle logo_url umgeschrieben sind. Hier greift die Härtung: nur
 *     https, nur genau der Supabase-Host, keine Weiterleitungen, Timeout und
 *     Grössenlimit. logo_url ist von jedem setzbar, der die Firma bearbeiten
 *     darf – ohne Allowlist könnte sie den Server zu einer beliebigen internen
 *     Adresse schicken.
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

const LOGO_FETCH_TIMEOUT_MS = 5000;

/**
 * Obergrenze für das, was in ein Dokument eingebettet wird. Absichtlich höher
 * als MAX_LOGO_BYTES des Uploads (2 MB): hier wird auch Bestand von früher
 * gelesen, der nie durch diese Prüfung lief.
 */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Host, von dem entfernte Logos stammen dürfen. Leer => kein Abruf erlaubt. */
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

function isAllowedLogoUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === "https:" && SUPABASE_HOST !== "" && u.host === SUPABASE_HOST;
  } catch {
    return false;
  }
}

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

async function loadRemoteLogo(url: string): Promise<LoadedLogo | null> {
  if (!isAllowedLogoUrl(url)) {
    console.warn("Logo-URL nicht erlaubt (SSRF-Schutz), wird übersprungen:", url);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
  try {
    // redirect: "manual" — die Allowlist prüft nur den ersten Hop. Würden wir
    // Weiterleitungen folgen, könnte eine logo_url auf dem Supabase-Host per
    // 30x doch noch auf eine interne Adresse zeigen.
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      console.warn("Logo übersprungen: Weiterleitung nicht erlaubt (SSRF-Schutz)");
      return null;
    }
    if (!res.ok) return null;

    // Content-Length ist nur ein Vorab-Hinweis (vom Server fälschbar oder
    // weglassbar); der eigentliche Schutz ist der Byte-Check nach arrayBuffer().
    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_LOGO_BYTES) {
      console.warn("Logo übersprungen: Content-Length überschreitet Limit:", declaredLength);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_LOGO_BYTES) {
      console.warn(
        "Logo übersprungen: tatsächliche Grösse überschreitet Limit:",
        arrayBuffer.byteLength,
      );
      return null;
    }

    return {
      bytes: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "image/png",
    };
  } catch (err) {
    console.warn("Logo konnte nicht geladen werden:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lädt das Firmenlogo, egal ob es lokal liegt oder noch als Supabase-Adresse
 * in der Spalte steht. Gibt null zurück, wenn kein Logo hinterlegt ist oder es
 * nicht gelesen werden konnte – Aufrufer rendern dann ohne Logo.
 */
export async function loadCompanyLogo(
  logoUrl: string | null | undefined,
): Promise<LoadedLogo | null> {
  if (!logoUrl) return null;
  const localSegments = segmentsFromLogoUrl(logoUrl);
  return localSegments ? loadLocalLogo(localSegments) : loadRemoteLogo(logoUrl);
}

/** Data-URL für @react-pdf (<Image src="data:…">). */
export function toDataUrl(logo: LoadedLogo): string {
  return `data:${logo.contentType};base64,${logo.bytes.toString("base64")}`;
}

/**
 * Bildart für den Word-Export. docx' ImageRun verlangt sie explizit (das PDF
 * liest sie aus der Data-URL). Nicht unterstützte Arten => null, Logo entfällt.
 */
export function docxImageType(logo: LoadedLogo): "png" | "jpg" | null {
  const t = logo.contentType.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  return null;
}
