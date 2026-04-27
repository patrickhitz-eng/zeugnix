/**
 * zeugnix.ch – Hash-Engine
 * ----------------------------------------------------------------------------
 * Berechnet einen deterministischen SHA-256-Hash über den kanonisierten
 * Zeugnisinhalt. Jede inhaltliche Veränderung führt zu einem abweichenden
 * Hash, während Layout, Metadaten und Hash-Block-Position keinen Einfluss
 * haben.
 *
 * Designprinzipien:
 * - Reine Funktionen, keine Seiteneffekte
 * - Deterministische Reihenfolge der Felder
 * - Whitespace- und Sonderzeichen-Normalisierung
 * - Hash-Block und QR-Code werden vor Hashing entfernt
 * - Verwendung von Web Crypto API (Node 20+ und Browser kompatibel)
 *
 * Disclaimer: Der Hash bestätigt Identität des Inhalts, nicht dessen
 * materielle Richtigkeit.
 */

// ============================================================================
// Typen
// ============================================================================

export interface CanonicalContent {
  type: string; // 'schluss' | 'zwischen' | etc.
  company: {
    name: string;
    address?: string;
  };
  employee: {
    firstName: string;
    lastName: string;
    gender: string;
    functionTitle: string;
    entryDate: string; // ISO YYYY-MM-DD
    exitDate?: string;
  };
  body: string; // Der eigentliche Zeugnistext (ohne Hash-Block)
  closing: string; // Schlussformel
  date: string; // ISO YYYY-MM-DD
  location: string;
}

// ============================================================================
// Kanonisierung
// ============================================================================

/**
 * Normalisiert Whitespace: Mehrfach-Leerzeichen → Einfach, Tabs → Space,
 * verschiedene Newline-Varianten vereinheitlichen, Trim.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Normalisiert Sonderzeichen: typografische Anführungszeichen → ASCII,
 * verschiedene Bindestriche → Standard-Hyphen, NBSP → Space.
 */
export function normalizeSpecialChars(text: string): string {
  return text
    .replace(/[\u00A0\u202F\u2007]/g, " ") // verschiedene Spaces → Space
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // double quotes
    .replace(/[\u2013\u2014]/g, "-") // en-dash, em-dash
    .replace(/[\u2026]/g, "...") // ellipsis
    .normalize("NFC"); // Unicode-Normalisierung
}

/**
 * Entfernt Hash-Block aus dem Text. Erkennt sowohl die ausführliche als auch
 * die Kurzversion. Toleriert Whitespace-Variationen.
 */
export function stripHashBlock(text: string): string {
  // Marker, der den Beginn des Hash-Blocks signalisiert
  const markers = [
    /Dieses Arbeitszeugnis wurde digital erstellt[\s\S]*?Hash:[\s\S]*$/i,
    /Dieses Arbeitszeugnis wurde mit zeugnix erstellt[\s\S]*?Hash:[\s\S]*$/i,
    /SHA-256[\s\-]?Echtheitsnachweis[\s\S]*$/i,
    /Hash:\s*[a-f0-9]{32,}[\s\S]*$/i,
  ];

  let result = text;
  for (const re of markers) {
    result = result.replace(re, "");
  }
  return result.trim();
}

/**
 * Erstellt aus einem strukturierten CanonicalContent-Objekt einen
 * stabilen, deterministischen String. Reihenfolge der Felder ist fix.
 */
export function buildCanonicalString(content: CanonicalContent): string {
  const parts: string[] = [];

  parts.push("ZEUGNIX-CANONICAL-v1");
  parts.push(`type:${content.type}`);
  parts.push(`company:${normalizeSpecialChars(content.company.name)}`);
  parts.push(`employee:${normalizeSpecialChars(content.employee.firstName)} ${normalizeSpecialChars(content.employee.lastName)}`);
  parts.push(`gender:${content.employee.gender}`);
  parts.push(`function:${normalizeSpecialChars(content.employee.functionTitle)}`);
  parts.push(`entry:${content.employee.entryDate}`);
  if (content.employee.exitDate) parts.push(`exit:${content.employee.exitDate}`);
  parts.push(`location:${normalizeSpecialChars(content.location)}`);
  parts.push(`date:${content.date}`);
  parts.push("---BODY---");
  parts.push(normalizeWhitespace(normalizeSpecialChars(content.body)));
  parts.push("---CLOSING---");
  parts.push(normalizeWhitespace(normalizeSpecialChars(content.closing)));

  return parts.join("\n");
}

/**
 * Vollständiger Kanonisierungs-Pipeline: aus rohem Zeugnis-Text
 * (z.B. aus PDF extrahiert) einen kanonischen String erzeugen.
 */
export function canonicalizeRawText(raw: string): string {
  let text = raw;
  text = stripHashBlock(text);
  text = normalizeSpecialChars(text);
  text = normalizeWhitespace(text);
  return text;
}

// ============================================================================
// SHA-256
// ============================================================================

/**
 * Berechnet SHA-256 als Hex-String. Web Crypto API – Node 20+ und Browser.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hauptfunktion: aus strukturiertem Inhalt berechnet kanonischen String
 * und Hash. Gibt beides zurück, weil canonical_content separat in der
 * Datenbank gespeichert wird (für Re-Verifikation).
 */
export async function computeCertificateHash(
  content: CanonicalContent,
): Promise<{ canonical: string; hash: string }> {
  const canonical = buildCanonicalString(content);
  const hash = await sha256(canonical);
  return { canonical, hash };
}

/**
 * Vergleichsfunktion für die Verifikation. Vergleicht zwei Hashes
 * case-insensitive und whitespace-tolerant.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Verifikations-Ergebnistyp
 */
export type VerifyOutcome =
  | { result: "verified"; matchedHash: string; matchedCertificateId: string }
  | { result: "mismatch"; calculatedHash: string }
  | { result: "unknown"; calculatedHash: string };

// ============================================================================
// Hilfsfunktionen für QR-Code-URL und Hash-Block-Text
// ============================================================================

/**
 * Erzeugt die URL, die im QR-Code des PDFs verschlüsselt wird.
 */
export function buildVerifyUrl(baseUrl: string, hash: string): string {
  const u = new URL("/verify", baseUrl);
  u.searchParams.set("hash", hash);
  return u.toString();
}

/**
 * Standard-Hash-Block-Text für PDFs.
 */
export function buildHashBlockText(hash: string, baseUrl: string): string {
  return [
    "Dieses Arbeitszeugnis wurde mit zeugnix.ch erstellt und mit einem",
    "kryptografischen Echtheitsnachweis versehen. Der nachstehende Hash",
    "bezieht sich auf den finalen Zeugnisinhalt. Jede nachträgliche",
    "Veränderung des Inhalts führt zu einem abweichenden Hash.",
    "",
    `Hash: ${hash}`,
    "",
    `Echtheit prüfen: ${baseUrl}/verify`,
  ].join("\n");
}
