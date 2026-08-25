/**
 * zeugnix.ch – Hash-Engine
 * ----------------------------------------------------------------------------
 * Berechnet einen deterministischen SHA-256-Hash über den kanonisierten
 * Zeugnis-Body. Finalisierung UND Verifikation nutzen exakt dieselbe
 * Pipeline (canonicalizeForHash), damit ein echtes zeugnix-PDF nach der
 * PDF-Textextraktion wieder denselben Hash ergibt.
 *
 * Gehasht wird ausschliesslich der sichtbare Fliesstext (Body). Im PDF wird
 * der Body von zwei (unsichtbar gerenderten) Sentinels eingerahmt, damit er
 * aus dem extrahierten Gesamttext (Briefkopf, Unterschriften, Hash-Block)
 * sauber isoliert werden kann.
 *
 * Designprinzipien:
 * - Reine Funktionen, keine Seiteneffekte
 * - Layout-/Whitespace-unabhängig: ALLE Whitespace-Läufe → ein Space
 *   (pdfjs verliert beim Extrahieren die Absatzstruktur)
 * - Sonderzeichen-Normalisierung (typografische Zeichen → ASCII, NFC)
 * - Web Crypto API (Node 20+ und Browser kompatibel)
 *
 * Disclaimer: Der Hash bestätigt Identität des Inhalts, nicht dessen
 * materielle Richtigkeit.
 */

// ============================================================================
// Sentinels – rahmen den Body im PDF ein (siehe lib/pdf/certificate.tsx)
// ============================================================================

export const BODY_SENTINEL_START = "[[zeugnix:body-start]]";
export const BODY_SENTINEL_END = "[[zeugnix:body-end]]";

// ============================================================================
// Kanonisierung
// ============================================================================

/**
 * Normalisiert Sonderzeichen: typografische Anführungszeichen → ASCII,
 * verschiedene Bindestriche → Standard-Hyphen, NBSP → Space, Ellipsis,
 * Unicode-NFC.
 */
export function normalizeSpecialChars(text: string): string {
  return text
    .replace(/[   ]/g, " ") // verschiedene Spaces → Space
    .replace(/[‘’‚‛]/g, "'") // single quotes
    .replace(/[“”„‟]/g, '"') // double quotes
    .replace(/[–—]/g, "-") // en-dash, em-dash
    .replace(/[…]/g, "...") // ellipsis
    .normalize("NFC"); // Unicode-Normalisierung
}

/**
 * Einzige Quelle der Wahrheit für den Hash-Input. Plättet ALLE
 * Whitespace-Läufe (Spaces, Tabs, Zeilenumbrüche) zu EINEM Space, damit der
 * aus dem PDF extrahierte (umbruchlose) Text denselben Wert ergibt wie der
 * gespeicherte Quelltext. Wird in Finalisierung UND Verifikation verwendet.
 */
export function canonicalizeForHash(text: string): string {
  return normalizeSpecialChars(text)
    .replace(/\s+/g, " ")
    // Zeilenumbruch-Trennstriche neutralisieren: ein Bindestrich gefolgt von
    // Whitespace ("Re- sultate") entsteht durch PDF-Silbentrennung und steht
    // nicht im Quelltext. Wird symmetrisch auf beiden Seiten angewandt; echte
    // Bindestriche ohne Folge-Space (Cold-Outreach) bleiben unberührt.
    .replace(/-\s/g, "")
    .trim();
}

/**
 * Schneidet aus rohem (z.B. aus PDF extrahiertem) Text den Body zwischen den
 * beiden Sentinels heraus – exklusiv der Marker selbst. Tolerant gegenüber
 * Whitespace innerhalb der Klammern (pdfjs kann Text-Items verkleben). Nimmt
 * das erste Start- und das erste darauf folgende End-Vorkommen. Gibt null
 * zurück, wenn ein Marker fehlt (z.B. Alt-PDF ohne Sentinels).
 */
export function extractBodyBetweenSentinels(raw: string): string | null {
  const startRe = /\[\[\s*zeugnix\s*:\s*body-start\s*\]\]/i;
  const endRe = /\[\[\s*zeugnix\s*:\s*body-end\s*\]\]/i;

  const startMatch = raw.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const afterStart = startMatch.index + startMatch[0].length;

  const tail = raw.slice(afterStart);
  const endMatch = tail.match(endRe);
  if (!endMatch || endMatch.index === undefined) return null;

  return tail.slice(0, endMatch.index);
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

// ============================================================================
// Verifikations-Ergebnistyp
// ============================================================================

/**
 * Registrierte Felder eines Treffers, die dem Prüfer zum Abgleich mit dem
 * vorliegenden Papier gezeigt werden (S1a). Bewusst nur die Vergleichsfelder,
 * die einen getauschten Briefkopf/Unterschriftenblock entlarven: Arbeitgeber
 * und Unterzeichnende stehen AUSSERHALB des Hashes, sind also fälschbar, ohne
 * dass sich der Hash ändert. Mitarbeiter/in, Dokumenttyp und Ausstelldatum
 * helfen, den richtigen Datensatz zu bestätigen. KEINE weiteren PII
 * (Geburtsdatum, Pensum, Funktion) – die stünden ohnehin im Papier.
 */
export interface VerifiedCertificateFields {
  employeeName: string;
  employer: string;
  documentType: string;
  issueDate: string | null;
  signatory1Name: string | null;
  signatory1Role: string | null;
  signatory2Name: string | null;
  signatory2Role: string | null;
  // V1: verifizierte Aussteller-Domain der Firma (null = nicht verifiziert).
  // Trust-Signal NEBEN dem Hash; belegt, dass ein berechtigter Mensch mit einer
  // E-Mail @dieser-Domain hinter dem Aussteller steht.
  verifiedDomain: string | null;
  // V2: Zeitpunkt (formatiert) der identitaetsgebundenen Unterzeichner-Freigabe
  // pro Slot (null = nicht per E-Mail bestaetigt). Die bestaetigende E-Mail
  // bleibt aus Datenschutzgruenden ausserhalb der oeffentlichen Antwort.
  signatory1ConfirmedAt: string | null;
  signatory2ConfirmedAt: string | null;
}

export type VerifyOutcome =
  | {
      result: "verified";
      matchedHash: string;
      matchedCertificateId: string;
      certificate: VerifiedCertificateFields;
    }
  | { result: "unknown"; calculatedHash: string }
  | { result: "no_sentinel" };

// ============================================================================
// Verify-URL (QR-Code / Link)
// ============================================================================

/**
 * Erzeugt die URL, die im QR-Code des PDFs kodiert wird und auf die
 * Verifikationsseite mit vorausgefülltem Hash zeigt.
 */
export function buildVerifyUrl(baseUrl: string, hash: string): string {
  const u = new URL("/verify", baseUrl);
  u.searchParams.set("hash", hash);
  return u.toString();
}
