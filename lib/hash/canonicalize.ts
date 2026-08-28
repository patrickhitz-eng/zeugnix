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

// S1b — Meta-Block. Rahmt (zusätzlich zum Body) einen unsichtbaren, maschinen-
// lesbaren Block mit den materiellen Feldern AUSSERHALB des Body ein
// (Arbeitgeber, Titel, Unterzeichnende). Diese Marker sind NEU (kein Bestands-
// PDF enthält sie), die Body-Sentinels bleiben unverändert. Bewusst gleiches
// `zeugnix:`-Präfix wie die Body-Sentinels, damit die Konvention einheitlich ist.
export const META_SENTINEL_START = "[[zeugnix:meta-start]]";
export const META_SENTINEL_END = "[[zeugnix:meta-end]]";

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
// S1b – Meta-Block (Arbeitgeber / Titel / Unterzeichnende)
// ============================================================================

/**
 * Materielle Felder, die im PDF AUSSERHALB des Body stehen und in v1 fälschbar
 * waren, ohne den Hash zu ändern. In v2 sind sie Teil des Hash.
 */
export interface CertificateMetaFields {
  employer: string;
  documentTitle: string;
  signatory1Name: string;
  signatory1Role: string;
  signatory2Name: string;
  signatory2Role: string;
}

/** Ergänzt ein evtl. unvollständiges Objekt zu vollständigen Meta-Feldern. */
export function toMetaFields(
  obj: Partial<CertificateMetaFields> | null | undefined,
): CertificateMetaFields {
  return {
    employer: obj?.employer ?? "",
    documentTitle: obj?.documentTitle ?? "",
    signatory1Name: obj?.signatory1Name ?? "",
    signatory1Role: obj?.signatory1Role ?? "",
    signatory2Name: obj?.signatory2Name ?? "",
    signatory2Role: obj?.signatory2Role ?? "",
  };
}

/**
 * Kanonischer, deterministischer String über die Meta-Felder. Feste
 * Feldreihenfolge; jeder Wert läuft durch dieselbe Body-Pipeline
 * (canonicalizeForHash), damit PDF-Extraktions-/Whitespace-Varianten denselben
 * Wert ergeben. Die Labels sorgen dafür, dass ein Feld-Tausch (z.B. Rolle als
 * Name) den Hash verändert.
 */
export function canonicalizeMeta(meta: CertificateMetaFields): string {
  const n = (v: string) => canonicalizeForHash(v ?? "");
  return [
    "employer=" + n(meta.employer),
    "title=" + n(meta.documentTitle),
    "sig1name=" + n(meta.signatory1Name),
    "sig1role=" + n(meta.signatory1Role),
    "sig2name=" + n(meta.signatory2Name),
    "sig2role=" + n(meta.signatory2Role),
  ].join("\n");
}

// Trenner zwischen Body- und Meta-Teil des v2-Hash. Bewusst ein Marker, damit
// sich die Grenze zwischen Body und Meta nicht durch geschickt gewählte Inhalte
// verschieben lässt.
const META_HASH_SEPARATOR = "\n[[zeugnix:meta]]\n";

/** v1-Hash: nur der kanonisierte Body (Bestandsschutz-Pfad). */
export async function hashBodyV1(body: string): Promise<string> {
  return sha256(canonicalizeForHash(body));
}

/** v2-Hash: deckt Body UND die materiellen Meta-Felder. */
export async function hashBodyMetaV2(
  body: string,
  meta: CertificateMetaFields,
): Promise<string> {
  return sha256(
    canonicalizeForHash(body) + META_HASH_SEPARATOR + canonicalizeMeta(meta),
  );
}

/**
 * Schneidet den Meta-Block zwischen den Meta-Sentinels heraus (roh, inkl. evtl.
 * durch pdfjs eingefügter Whitespace). Tolerant gegenüber Whitespace in den
 * Klammern. null, wenn kein Meta-Block vorhanden ist (v1-/Alt-PDF).
 */
export function extractMetaBetweenSentinels(raw: string): string | null {
  const startRe = /\[\[\s*zeugnix\s*:\s*meta-start\s*\]\]/i;
  const endRe = /\[\[\s*zeugnix\s*:\s*meta-end\s*\]\]/i;
  const startMatch = raw.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const afterStart = startMatch.index + startMatch[0].length;
  const tail = raw.slice(afterStart);
  const endMatch = tail.match(endRe);
  if (!endMatch || endMatch.index === undefined) return null;
  return tail.slice(0, endMatch.index);
}

/**
 * Kodiert die Meta-Felder als Base64(JSON) für den unsichtbaren PDF-Block.
 * Base64 enthält keine bedeutungstragende Whitespace – beim Prüfen wird die
 * gesamte Whitespace entfernt, wodurch pdfjs-Eigenheiten (eingefügte Spaces/
 * Umbrüche im weissen 6pt-Text) den Wert nicht mehr verfälschen können.
 * Isomorph (btoa/TextEncoder – Node 20+ und Browser).
 */
export function encodeMetaBlock(meta: CertificateMetaFields): string {
  const json = JSON.stringify({ v: 2, ...meta });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Dekodiert den (evtl. mit Whitespace durchsetzten) Meta-Block zurück zu den
 * Meta-Feldern. null, wenn der Block leer/unlesbar ist.
 */
export function decodeMetaBlock(rawBlock: string): CertificateMetaFields | null {
  const b64 = rawBlock.replace(/\s+/g, "");
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return toMetaFields(obj as Partial<CertificateMetaFields>);
  } catch {
    return null;
  }
}

// ============================================================================
// S2 – Kryptografische Signatur (Ed25519)
// ============================================================================
// Der SHA-256 belegt Inhalts-Identität (jeder kann ihn nachrechnen), NICHT
// Urheberschaft. S2 signiert den v2-Hash mit einem privaten Plattform-Schlüssel;
// die Prüfung verifiziert die Signatur gegen den öffentlichen Schlüssel –
// offline, ohne DB. Damit gilt „nur zeugnio konnte das ausstellen".
//
// Die hier liegenden Helfer sind ISOMORPH (kein node:crypto): Payload-Aufbau
// und das Encode/Decode des unsichtbaren PDF-Blocks. Das eigentliche Signieren/
// Verifizieren (privater Schlüssel) lebt server-only in lib/crypto/signing.ts.

// Eigene Sentinels für den unsichtbaren Signatur-Block. Neu (kein Bestands-PDF
// enthält sie); Body- und Meta-Sentinels bleiben unverändert.
export const SIG_SENTINEL_START = "[[zeugnix:sig-start]]";
export const SIG_SENTINEL_END = "[[zeugnix:sig-end]]";

// Domain-Separations-Präfix: signiert wird NICHT der nackte Hash, sondern
// dieser Präfix + Hash. Verhindert, dass eine hier erzeugte Signatur in einem
// fremden Kontext als gültig missbraucht werden kann. Versioniert.
const SIG_PAYLOAD_PREFIX = "zeugnio-cert-sig-v1:";

/** Kanonische, zu signierende Nachricht über den v2-Hash. */
export function buildSignaturePayload(hashV2: string): string {
  return SIG_PAYLOAD_PREFIX + hashV2;
}

export interface CertificateSignatureBlock {
  /** ID des Schlüssels, mit dem signiert wurde (erlaubt Rotation). */
  keyId: string;
  /** Base64 der Ed25519-Signatur. */
  signature: string;
}

/**
 * Kodiert den Signatur-Block als Base64(JSON) für den unsichtbaren PDF-Block –
 * exakt wie encodeMetaBlock (whitespace-robust: beim Prüfen wird sämtliche
 * Whitespace entfernt, wodurch pdfjs-Eigenheiten den Wert nicht verfälschen).
 */
export function encodeSignatureBlock(block: CertificateSignatureBlock): string {
  const json = JSON.stringify({ v: 1, kid: block.keyId, sig: block.signature });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Dekodiert den (evtl. mit Whitespace durchsetzten) Signatur-Block. null, wenn
 * leer/unlesbar oder unvollständig. */
export function decodeSignatureBlock(
  rawBlock: string,
): CertificateSignatureBlock | null {
  const b64 = rawBlock.replace(/\s+/g, "");
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    const kid = typeof obj.kid === "string" ? obj.kid : "";
    const sig = typeof obj.sig === "string" ? obj.sig : "";
    if (!kid || !sig) return null;
    return { keyId: kid, signature: sig };
  } catch {
    return null;
  }
}

/** Schneidet den Signatur-Block zwischen den Sig-Sentinels heraus (roh). null,
 * wenn kein Block vorhanden ist (v1-/v2-ohne-Signatur/Alt-PDF). */
export function extractSignatureBetweenSentinels(raw: string): string | null {
  const startRe = /\[\[\s*zeugnix\s*:\s*sig-start\s*\]\]/i;
  const endRe = /\[\[\s*zeugnix\s*:\s*sig-end\s*\]\]/i;
  const startMatch = raw.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const afterStart = startMatch.index + startMatch[0].length;
  const tail = raw.slice(afterStart);
  const endMatch = tail.match(endRe);
  if (!endMatch || endMatch.index === undefined) return null;
  return tail.slice(0, endMatch.index);
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
  // S1b: Siegel-Version des Treffers. 2 = Body UND Aussteller/Titel/
  // Unterzeichnende sind vom Hash gedeckt; 1 = nur Fliesstext (Alt-Zeugnis,
  // Bestandsschutz). Steuert das Vertrauens-Label in der Prüfung.
  sealVersion: number;
  // S2: true = das PDF trägt eine GÜLTIGE kryptografische zeugnio-Signatur
  // (Ed25519) über seinen Inhalt, gegen den öffentlichen Plattform-Schlüssel
  // offline (ohne DB) verifiziert -> „nur zeugnio konnte das ausstellen".
  // false/undefined = keine (gültige) Signatur (Alt-Zeugnis vor S2, oder der
  // Signatur-Block fehlt/ist gebrochen). Bestandsschutz: false stuft nur das
  // Trust-Label ab, der v2-/v1-Hash-Match bleibt davon unberührt.
  signatureValid?: boolean;
}

export type VerifyOutcome =
  | {
      result: "verified";
      matchedHash: string;
      matchedCertificateId: string;
      certificate: VerifiedCertificateFields;
    }
  | {
      result: "revoked";
      matchedHash: string;
      matchedCertificateId: string;
      revokedAt: string | null;
      certificate: VerifiedCertificateFields;
    }
  // S1b: Der Body stimmt mit einem registrierten v2-Zeugnis überein, aber der
  // Meta-Block (Aussteller/Titel/Unterzeichnende) rekonstruiert nicht den
  // gesiegelten Hash – d.h. Briefkopf/Unterschriften wurden getauscht oder der
  // Block ist unlesbar. Die registrierten Soll-Angaben werden mitgegeben.
  | {
      result: "mismatch";
      matchedCertificateId: string;
      calculatedHash: string;
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
