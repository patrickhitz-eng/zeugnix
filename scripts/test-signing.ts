/**
 * Tests für die S2-Signatur (Ed25519) – lib/crypto/signing.ts +
 * Signatur-Helfer in lib/hash/canonicalize.ts.
 *
 * Ausführen:
 *   npm run test:signing   (bzw. npx tsx scripts/test-signing.ts)
 *
 * Ohne Test-Framework (keine zusätzlichen Dependencies). Kerngedanke: die beim
 * Finalisieren erzeugte Signatur MUSS bei der Prüfung – nach dem Umweg durch den
 * (whitespace-verfremdenden) PDF-Block – gegen den öffentlichen Schlüssel
 * verifizieren, und JEDE Manipulation am Inhalt oder an der Signatur muss sie
 * brechen.
 */
import {
  buildSignaturePayload,
  encodeSignatureBlock,
  decodeSignatureBlock,
  extractSignatureBetweenSentinels,
  hashBodyMetaV2,
  SIG_SENTINEL_START,
  SIG_SENTINEL_END,
  type CertificateMetaFields,
} from "../lib/hash/canonicalize";
import {
  generateSigningKeyPair,
  signHashWithPrivateKey,
  verifyHashWithPublicKey,
  keyIdForPublicKey,
  signCertificateHash,
  verifyCertificateSignature,
  isSigningConfigured,
  activeKeyId,
  publicKeyRegistry,
  _resetSigningCacheForTests,
} from "../lib/crypto/signing";
import { createPublicKey } from "node:crypto";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

// pdfjs-Simulation: der weisse Block wird alle 40 Zeichen umbrochen (chunkForWrap)
// und kann beim Extrahieren zusätzliche Spaces/Umbrüche erhalten.
function simulatePdfExtract(encoded: string): string {
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += 40) parts.push(encoded.slice(i, i + 40));
  const wrapped = parts.join(" \n ");
  return `Kopf ... ${SIG_SENTINEL_START}\n  ${wrapped}  \n${SIG_SENTINEL_END} ... Fuss`;
}

const META: CertificateMetaFields = {
  employer: "Muster AG",
  documentTitle: "Arbeitszeugnis",
  signatory1Name: "Max Muster",
  signatory1Role: "CEO",
  signatory2Name: "Anna Beispiel",
  signatory2Role: "Leiterin HR",
};

async function main() {
  const BODY = "Frau Beispiel war stets zu unserer vollsten Zufriedenheit taetig.";
  const hashV2 = await hashBodyMetaV2(BODY, META);

  const kpA = generateSigningKeyPair();
  const kpB = generateSigningKeyPair();
  const keyIdA = keyIdForPublicKey(createPublicKey(kpA.publicKeyPem));

  // ---------------------------------------------------------------- Payload
  console.log("\nS2 – Signatur-Payload");
  const payload = buildSignaturePayload(hashV2);
  check("Payload trägt das versionierte Domain-Präfix", payload.startsWith("zeugnio-cert-sig-v1:"));
  check("Payload endet auf den v2-Hash", payload.endsWith(hashV2));
  check("Payload ist NICHT der nackte Hash", payload !== hashV2);

  // -------------------------------------------------------- Sign/Verify pur
  console.log("\nS2 – Signieren & Verifizieren (Schlüssel explizit)");
  const sigA = signHashWithPrivateKey(hashV2, kpA.privateKeyPem);
  check("gültige Signatur verifiziert", verifyHashWithPublicKey(hashV2, kpA.publicKeyPem, sigA));
  check(
    "Ed25519 ist deterministisch (gleiche Eingabe -> gleiche Signatur)",
    signHashWithPrivateKey(hashV2, kpA.privateKeyPem) === sigA,
  );
  check("keyId ist deterministisch aus dem öffentlichen Schlüssel", keyIdForPublicKey(createPublicKey(kpA.publicKeyPem)) === keyIdA);
  check("keyId ist 16 Hex-Zeichen", /^[0-9a-f]{16}$/.test(keyIdA));

  // ------------------------------------------------------- Manipulation bricht
  console.log("\nS2 – Manipulation bricht die Signatur");
  const hashTampered = await hashBodyMetaV2(BODY + " (geändert)", META);
  check("anderer Inhalt (Hash) -> Verify schlägt fehl", !verifyHashWithPublicKey(hashTampered, kpA.publicKeyPem, sigA));
  check("fremder öffentlicher Schlüssel -> Verify schlägt fehl", !verifyHashWithPublicKey(hashV2, kpB.publicKeyPem, sigA));
  const flipped = sigA.slice(0, -2) + (sigA.endsWith("A") ? "B" : "A") + "=";
  check("verfälschte Signatur -> Verify schlägt fehl", !verifyHashWithPublicKey(hashV2, kpA.publicKeyPem, flipped));
  check("Müll-Signatur -> Verify wirft nicht, sondern false", !verifyHashWithPublicKey(hashV2, kpA.publicKeyPem, "not-base64!!"));

  // ---------------------------------------------------------- Block-Kodierung
  console.log("\nS2 – Signatur-Block (Base64 im PDF)");
  const encoded = encodeSignatureBlock({ keyId: keyIdA, signature: sigA });
  const decoded = decodeSignatureBlock(encoded);
  check("Encode/Decode-Round-Trip erhält keyId + signature", !!decoded && decoded.keyId === keyIdA && decoded.signature === sigA);
  check("Decode ist tolerant gegenüber Whitespace", (() => {
    const noisy = encoded.replace(/(.{10})/g, "$1 \n ");
    const d = decodeSignatureBlock(noisy);
    return !!d && d.signature === sigA;
  })());
  check("Decode: leerer Block -> null", decodeSignatureBlock("   ") === null);
  check("Decode: kaputtes Base64 -> null", decodeSignatureBlock("###") === null);
  check("Decode: fehlende Felder -> null", (() => {
    const bad = Buffer.from(JSON.stringify({ v: 1, kid: keyIdA }), "utf8").toString("base64");
    return decodeSignatureBlock(bad) === null;
  })());

  // ------------------------------------------------------------- Extract
  console.log("\nS2 – Extraktion aus dem (rohen) PDF-Text");
  const raw = simulatePdfExtract(encoded);
  const extracted = extractSignatureBetweenSentinels(raw);
  check("Block wird zwischen den Sentinels isoliert", extracted !== null);
  check("kein Sentinel -> null", extractSignatureBetweenSentinels("Text ohne Marker") === null);

  // ------------------------------------------------------------- End-to-End
  console.log("\nS2 – End-to-End (finalize -> PDF-Block -> verify)");
  const e2eDecoded = extracted ? decodeSignatureBlock(extracted) : null;
  check("E2E: Block aus simuliertem PDF dekodiert", !!e2eDecoded);
  check(
    "E2E: rekonstruierte Signatur verifiziert gegen den öffentlichen Schlüssel",
    !!e2eDecoded && verifyHashWithPublicKey(hashV2, kpA.publicKeyPem, e2eDecoded.signature),
  );

  // ------------------------------------------------------ Env-gebundener Pfad
  console.log("\nS2 – Env-gebundener Signatur-/Prüfpfad (aktiver + rotierter Schlüssel)");
  process.env.ZEUGNIO_SIGNING_PRIVATE_KEY = kpA.privateKeyPem;
  // kpB als „zurückgezogener" öffentlicher Schlüssel hinterlegen (Rotation).
  process.env.ZEUGNIO_SIGNING_PUBLIC_KEYS = JSON.stringify({ "k-alt": kpB.publicKeyPem });
  _resetSigningCacheForTests();

  check("isSigningConfigured() = true, sobald Env gesetzt ist", isSigningConfigured());
  check("activeKeyId() entspricht dem aktiven Schlüssel", activeKeyId() === keyIdA);

  const envSigned = signCertificateHash(hashV2);
  check("signCertificateHash liefert keyId + signature", !!envSigned && envSigned.keyId === keyIdA);
  check(
    "verifyCertificateSignature akzeptiert die aktive Signatur",
    !!envSigned && verifyCertificateSignature(hashV2, envSigned.keyId, envSigned.signature),
  );
  check(
    "verifyCertificateSignature lehnt bei anderem Inhalt ab",
    !!envSigned && !verifyCertificateSignature(hashTampered, envSigned.keyId, envSigned.signature),
  );
  check(
    "verifyCertificateSignature lehnt unbekannte keyId ab",
    !!envSigned && !verifyCertificateSignature(hashV2, "ffffffffffffffff", envSigned.signature),
  );

  // Rotation: eine mit dem ZURÜCKGEZOGENEN Schlüssel B erzeugte Signatur muss
  // über dessen (in der Registry hinterlegten) öffentlichen Schlüssel weiter
  // verifizieren – so bleiben vor der Rotation ausgestellte Zeugnisse gültig.
  const keyIdB = keyIdForPublicKey(createPublicKey(kpB.publicKeyPem));
  const sigWithRetired = signHashWithPrivateKey(hashV2, kpB.privateKeyPem);
  check(
    "Rotation: Signatur eines zurückgezogenen Schlüssels verifiziert weiterhin",
    verifyCertificateSignature(hashV2, keyIdB, sigWithRetired),
  );

  const registry = publicKeyRegistry();
  check("publicKeyRegistry listet aktiven + zurückgezogenen Schlüssel", registry.length === 2);
  check("Registry markiert genau einen Schlüssel als aktiv", registry.filter((k) => k.active).length === 1);
  check("Registry gibt niemals einen privaten Schlüssel aus", registry.every((k) => k.publicKeyPem.includes("PUBLIC KEY") && !k.publicKeyPem.includes("PRIVATE")));

  // Aufräumen, damit ein späterer Import in derselben Runtime sauber ist.
  delete process.env.ZEUGNIO_SIGNING_PRIVATE_KEY;
  delete process.env.ZEUGNIO_SIGNING_PUBLIC_KEYS;
  _resetSigningCacheForTests();
  check("ohne Env: isSigningConfigured() = false (Bestandsschutz)", !isSigningConfigured());
  check("ohne Env: signCertificateHash() = null", signCertificateHash(hashV2) === null);

  console.log(`\n${failed === 0 ? "✓" : "✗"} S2-Signatur: ${passed} bestanden, ${failed} fehlgeschlagen\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
