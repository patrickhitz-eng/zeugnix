/**
 * zeugnix.ch – S2: Ed25519-Plattform-Signatur (SERVER-ONLY)
 * ----------------------------------------------------------------------------
 * Beim Finalisieren wird der v2-Hash mit dem privaten Plattform-Schlüssel
 * signiert; die Prüfung verifiziert die Signatur gegen den öffentlichen
 * Schlüssel – OFFLINE, ohne DB. Das hebt das Vertrauen von „Inhalt ist in der
 * DB registriert" (jeder kann den SHA-256 nachrechnen) auf „nur zeugnio konnte
 * das ausstellen" und schützt sogar gegen einen Angreifer mit DB-Schreibzugriff,
 * solange der private Schlüssel getrennt verwahrt wird.
 *
 * WICHTIG:
 *  - Importiert node:crypto und liest den privaten Schlüssel aus der Umgebung.
 *    NIEMALS in Client-Code importieren.
 *  - Die kanonische Nachricht (buildSignaturePayload) und die isomorphen
 *    Encode/Decode-Helfer des PDF-Blocks liegen in lib/hash/canonicalize.ts.
 *  - Ist KEIN Schlüssel konfiguriert (Dev/Preview ohne Env), degradiert alles
 *    sauber: signCertificateHash() -> null, Finalisierung/PDF laufen ohne
 *    Signatur weiter (voller Bestandsschutz), die Prüfung zeigt einfach kein
 *    Signatur-Siegel. Die Signatur „schaltet sich ein", sobald die Env gesetzt ist.
 *
 * Schlüssel-Konfiguration (Env, z. B. Vercel):
 *  - ZEUGNIO_SIGNING_PRIVATE_KEY   – aktiver privater Schlüssel. Akzeptiert
 *    rohes PKCS8-PEM ODER Base64-verpacktes PEM (eine Zeile, praktisch fürs
 *    Einfügen in ein Env-Feld). Der öffentliche Schlüssel + die Key-ID werden
 *    daraus abgeleitet (nichts Zusätzliches zu hinterlegen).
 *  - ZEUGNIO_SIGNING_PUBLIC_KEYS   – OPTIONAL. JSON-Objekt { "<label>": "<pubPem>" }
 *    mit ZURÜCKGEZOGENEN öffentlichen Schlüsseln, damit vor einer Rotation
 *    ausgestellte Zeugnisse weiterhin verifizieren. Die Key-ID wird pro Eintrag
 *    aus dem Schlüssel selbst abgeleitet (dem Label wird nicht vertraut).
 *
 * Schlüssel erzeugen: `npx tsx scripts/generate-signing-key.ts`.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from "node:crypto";
import { buildSignaturePayload } from "../hash/canonicalize";

const ENV_PRIVATE_KEY = "ZEUGNIO_SIGNING_PRIVATE_KEY";
const ENV_RETIRED_PUBLIC_KEYS = "ZEUGNIO_SIGNING_PUBLIC_KEYS";

/**
 * Normalisiert einen aus der Umgebung gelesenen PEM-Wert: akzeptiert sowohl
 * rohes PEM (mit „-----BEGIN") als auch Base64-verpacktes PEM (eine Zeile).
 */
function normalizePem(raw: string): string {
  const t = raw.trim();
  if (t.includes("-----BEGIN")) return t;
  try {
    const decoded = Buffer.from(t, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    /* fällt unten auf t zurück */
  }
  return t;
}

/** Key-ID = erste 16 Hex-Zeichen von SHA-256(SPKI-DER des öffentlichen Schlüssels). */
export function keyIdForPublicKey(pub: KeyObject): string {
  const der = pub.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

interface ActiveKey {
  privateKey: KeyObject;
  publicKey: KeyObject;
  keyId: string;
}

// Lazy + gecacht: erst beim ersten Aufruf gelesen (nicht beim Import), damit
// Tests die Env vor dem ersten Aufruf setzen können. undefined = noch nicht
// versucht; null = kein/ungültiger Schlüssel konfiguriert.
let cachedActive: ActiveKey | null | undefined;

function loadActiveKey(): ActiveKey | null {
  if (cachedActive !== undefined) return cachedActive;
  const raw = process.env[ENV_PRIVATE_KEY];
  if (!raw || !raw.trim()) {
    cachedActive = null;
    return cachedActive;
  }
  try {
    const privateKey = createPrivateKey(normalizePem(raw));
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error(
        `erwartet Ed25519, erhalten ${privateKey.asymmetricKeyType ?? "unbekannt"}`,
      );
    }
    const publicKey = createPublicKey(privateKey);
    cachedActive = { privateKey, publicKey, keyId: keyIdForPublicKey(publicKey) };
  } catch (err) {
    console.error(
      "[signing] Aktiver Signaturschlüssel konnte nicht geladen werden:",
      (err as Error).message,
    );
    cachedActive = null;
  }
  return cachedActive;
}

/** Nur für Tests: Cache verwerfen, damit eine neu gesetzte Env greift. */
export function _resetSigningCacheForTests(): void {
  cachedActive = undefined;
}

/** true, wenn ein gültiger aktiver Signaturschlüssel konfiguriert ist. */
export function isSigningConfigured(): boolean {
  return loadActiveKey() !== null;
}

/** Die aktive Key-ID (oder null). */
export function activeKeyId(): string | null {
  return loadActiveKey()?.keyId ?? null;
}

/**
 * Signiert den v2-Hash mit dem aktiven privaten Schlüssel. null, wenn kein
 * Schlüssel konfiguriert ist (Finalisierung läuft dann ohne Signatur weiter).
 */
export function signCertificateHash(
  hashV2: string,
): { keyId: string; signature: string } | null {
  const active = loadActiveKey();
  if (!active) return null;
  const msg = Buffer.from(buildSignaturePayload(hashV2), "utf8");
  // Ed25519: der Algorithmus-Parameter von crypto.sign ist null.
  const sig = nodeSign(null, msg, active.privateKey);
  return { keyId: active.keyId, signature: sig.toString("base64") };
}

/**
 * Bekannte öffentliche Schlüssel: der aktive (aus dem privaten abgeleitet) plus
 * optionale zurückgezogene aus ZEUGNIO_SIGNING_PUBLIC_KEYS. Gemappt per Key-ID,
 * die jeweils aus dem Schlüssel selbst abgeleitet wird.
 */
function knownPublicKeys(): Map<string, KeyObject> {
  const map = new Map<string, KeyObject>();
  const active = loadActiveKey();
  if (active) map.set(active.keyId, active.publicKey);

  const retiredRaw = process.env[ENV_RETIRED_PUBLIC_KEYS];
  if (retiredRaw && retiredRaw.trim()) {
    try {
      const obj = JSON.parse(retiredRaw);
      if (obj && typeof obj === "object") {
        for (const pem of Object.values(obj)) {
          if (typeof pem !== "string") continue;
          try {
            const pub = createPublicKey(normalizePem(pem));
            if (pub.asymmetricKeyType !== "ed25519") continue;
            map.set(keyIdForPublicKey(pub), pub);
          } catch {
            /* ungültigen Eintrag überspringen */
          }
        }
      }
    } catch {
      /* ungültiges JSON ignorieren */
    }
  }
  return map;
}

/**
 * Prüft die Signatur über den v2-Hash gegen den öffentlichen Schlüssel der
 * angegebenen Key-ID. false bei unbekannter Key-ID, ungültiger Signatur oder
 * jedem Fehler. Rein server-seitig (node:crypto).
 */
export function verifyCertificateSignature(
  hashV2: string,
  keyId: string,
  signatureB64: string,
): boolean {
  try {
    const pub = knownPublicKeys().get(keyId);
    if (!pub) return false;
    const msg = Buffer.from(buildSignaturePayload(hashV2), "utf8");
    const sig = Buffer.from(signatureB64, "base64");
    return nodeVerify(null, msg, pub, sig);
  } catch {
    return false;
  }
}

/**
 * Öffentliche Schlüssel für den Transparenz-Endpoint (GET /api/signing-keys):
 * erlaubt externe, offline nachvollziehbare Prüfung und Rotation.
 */
export function publicKeyRegistry(): Array<{
  keyId: string;
  algorithm: string;
  publicKeyPem: string;
  active: boolean;
}> {
  const active = loadActiveKey();
  const out: Array<{
    keyId: string;
    algorithm: string;
    publicKeyPem: string;
    active: boolean;
  }> = [];
  for (const [kid, pub] of knownPublicKeys().entries()) {
    out.push({
      keyId: kid,
      algorithm: "Ed25519",
      publicKeyPem: pub.export({ type: "spki", format: "pem" }).toString(),
      active: !!active && kid === active.keyId,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schlüssel-unabhängige Primitive (für Tests & scripts/generate-signing-key.ts)
// ---------------------------------------------------------------------------

/** Erzeugt ein neues Ed25519-Schlüsselpaar samt abgeleiteter Key-ID. */
export function generateSigningKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    keyId: keyIdForPublicKey(publicKey),
  };
}

/** Signiert den v2-Hash mit einem explizit übergebenen privaten PEM. */
export function signHashWithPrivateKey(
  hashV2: string,
  privateKeyPem: string,
): string {
  const msg = Buffer.from(buildSignaturePayload(hashV2), "utf8");
  return nodeSign(null, msg, createPrivateKey(normalizePem(privateKeyPem))).toString(
    "base64",
  );
}

/** Verifiziert eine Signatur über den v2-Hash gegen ein explizites öffentliches PEM. */
export function verifyHashWithPublicKey(
  hashV2: string,
  publicKeyPem: string,
  signatureB64: string,
): boolean {
  try {
    const msg = Buffer.from(buildSignaturePayload(hashV2), "utf8");
    return nodeVerify(
      null,
      msg,
      createPublicKey(normalizePem(publicKeyPem)),
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}
