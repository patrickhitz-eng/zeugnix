/**
 * S2 – Ed25519-Signaturschlüssel erzeugen.
 *
 * Ausführen:
 *   npx tsx scripts/generate-signing-key.ts
 *
 * Gibt ein frisches Schlüsselpaar aus und die fertigen Werte zum Einfügen in die
 * Vercel-Umgebungsvariablen. Der PRIVATE Schlüssel wird NUR angezeigt (nie in
 * die DB/Repo geschrieben) – einmalig sicher hinterlegen (Vercel-Env + separates
 * Backup, z. B. Passwortmanager). Wer den privaten Schlüssel hat, kann im Namen
 * von zeugnio signieren.
 *
 * Ablauf:
 *   1. Skript ausführen, Ausgabe kopieren.
 *   2. In Vercel (Production) die Variable ZEUGNIO_SIGNING_PRIVATE_KEY setzen
 *      (Base64-Einzeiler unten – am einfachsten fürs Env-Feld).
 *   3. Neu deployen. Ab dann werden neu finalisierte Zeugnisse signiert; die
 *      Prüfung zeigt „Kryptografisch signiert". Bereits ausgestellte Zeugnisse
 *      bleiben über den v2-/v1-Hash gültig (Bestandsschutz).
 *
 * Rotation (später): neuen Schlüssel erzeugen, als ZEUGNIO_SIGNING_PRIVATE_KEY
 * setzen und den ALTEN öffentlichen Schlüssel (public PEM unten) in
 * ZEUGNIO_SIGNING_PUBLIC_KEYS als JSON { "k-alt": "<pubPem>" } hinterlegen, damit
 * vor der Rotation ausgestellte Zeugnisse weiterhin verifizieren.
 */
import { generateSigningKeyPair } from "../lib/crypto/signing";

const { privateKeyPem, publicKeyPem, keyId } = generateSigningKeyPair();
const privateKeyBase64 = Buffer.from(privateKeyPem, "utf8").toString("base64");

const line = "=".repeat(76);
console.log(`
${line}
  zeugnio – Ed25519 Signaturschlüssel  (Key-ID: ${keyId})
${line}

▶ VERCEL ENV (Production)  —  Variable: ZEUGNIO_SIGNING_PRIVATE_KEY
  Diesen Base64-Einzeiler als Wert einfügen:

${privateKeyBase64}

${line}
  Öffentlicher Schlüssel (darf veröffentlicht werden; NICHT geheim)
${line}
${publicKeyPem.trim()}

  Key-ID (abgeleitet, erscheint im PDF-Signaturblock): ${keyId}

${line}
  PRIVATER Schlüssel (PEM)  —  GEHEIM, nur als Backup sicher verwahren
${line}
${privateKeyPem.trim()}
${line}

Hinweis: Ohne gesetzte Env läuft alles unverändert weiter – Zeugnisse werden
dann nur nicht signiert (voller Bestandsschutz). Die Signatur „schaltet sich
ein", sobald ZEUGNIO_SIGNING_PRIVATE_KEY gesetzt und neu deployt ist.
`);
