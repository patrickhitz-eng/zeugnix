/**
 * Tests für die gehashten Token-Links — lib/link-token.ts (Sicherheitstest
 * 24.11.2026, Befund M4).
 *
 * Ausführen:
 *   npm run test:link-token   (bzw. npx tsx scripts/test-link-token.ts)
 *
 * Geprüft wird:
 *   1. Der Hash ist SHA-256 hex über UTF-8, also genau das, was Migration 040
 *      in SQL rechnet (encode(sha256(convert_to(token, 'UTF8')), 'hex')).
 *      Sonst fänden schon verschickte Links ihre Zeile nicht mehr.
 *   2. Neue Tokens: 256 Bit, base64url, Hash passt, nie zweimal derselbe.
 *   3. Nachschlagen: Ein Token findet seine Zeile über den Hash; der Hash selbst
 *      oder ein fremder Wert findet nichts.
 *   4. Kein Code-Pfad sucht mehr über die Klartext-Spalte `token`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  hashLinkToken,
  isPlausibleLinkToken,
  lookupHash,
  newLinkToken,
} from "../lib/link-token";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("\n1. Hash wie in Migration 040");
// Bekannter Prüfwert aus FIPS 180-2.
check(
  "sha256('abc')",
  hashLinkToken("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
);
// Ein Token im alten Format (Hex, 64 Zeichen). Den Hash dazu hat PostgreSQL 17
// mit encode(sha256(convert_to('00…ff', 'UTF8')), 'hex') gerechnet; der Test
// der Migration auf dem Wegwerf-Cluster vergleicht beide Seiten zusätzlich.
const OLD_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
check("Hash ist 64 Zeichen Hex", /^[0-9a-f]{64}$/.test(hashLinkToken(OLD_HEX)));
check("altes Hex-Format gilt als Token", isPlausibleLinkToken(OLD_HEX));

console.log("\n2. Neue Tokens");
const a = newLinkToken();
const b = newLinkToken();
check("base64url, 43 Zeichen (32 Byte)", /^[A-Za-z0-9_-]{43}$/.test(a.token), a.token.length.toString());
check("Hash gehört zum Token", a.tokenHash === hashLinkToken(a.token));
check("Hash ist nicht der Token", a.tokenHash !== a.token);
check("zwei Tokens sind verschieden", a.token !== b.token && a.tokenHash !== b.tokenHash);
check("neues Format gilt als Token", isPlausibleLinkToken(a.token));
check("Hash passt zur Prüfregel der Spalte", /^[0-9a-f]{64}$/.test(a.tokenHash));

console.log("\n3. Nachschlagen über den Hash");
// Stellvertretend für die Tabelle: nur Hashes, wie nach 040.
const table = new Map<string, string>([
  [a.tokenHash, "einladung-a"],
  [hashLinkToken(OLD_HEX), "alte-einladung"],
]);
const find = (value: unknown) => {
  const h = lookupHash(value);
  return h ? table.get(h) ?? null : null;
};
check("neuer Token findet seine Zeile", find(a.token) === "einladung-a");
check("alter Hex-Token findet seine Zeile", find(OLD_HEX) === "alte-einladung");
check("der Hash aus der Tabelle öffnet nichts", find(a.tokenHash) === null);
check("fremder Token findet nichts", find(b.token) === null);
check("leer → null", lookupHash("") === null);
check("zu kurz → null", lookupHash("abc") === null);
check("Sonderzeichen → null", lookupHash("a".repeat(40) + "/../") === null);
check("kein String → null", lookupHash(undefined) === null && lookupHash(42) === null);
check("zu lang → null", lookupHash("a".repeat(129)) === null);

console.log("\n4. Keine Suche über die Klartext-Spalte");
const ROOT = path.join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const sources = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))];
const offenders = sources.filter((file) => {
  const text = readFileSync(file, "utf8");
  const eqPlain = /\.eq\(\s*["']token["']/.test(text);
  const insertPlain =
    /\btoken\s*:\s*token\b|^\s*token,\s*$/m.test(text) &&
    /manager_invitations|certificate_signoffs/.test(text);
  return eqPlain || insertPlain;
});
check(
  "kein .eq(\"token\", …) und kein Klartext-Token in Einladungen/Freigaben",
  offenders.length === 0,
  offenders.map((f) => path.relative(ROOT, f)).join(", "),
);

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
if (failed > 0) process.exit(1);
