/**
 * Tests für den QR-Weg der Prüfung: Verify-URL mit Hash im Fragment,
 * Lesen des Fragments und Normalisieren des Prüfwerts
 * (lib/hash/canonicalize.ts).
 *
 * Ausführen:
 *   npm run test:verify-hash   (bzw. npx tsx scripts/test-verify-hash.ts)
 *
 * Ohne Test-Framework. Kerngedanke: Der Hash im QR-Code steht im Fragment und
 * damit nie in einer Anfrage an den Server, die Seite findet ihn trotzdem
 * wieder, und nur ein echter SHA-256-Hex erreicht die Datenbank.
 */
import {
  buildVerifyUrl,
  normalizeVerifyHash,
  readHashFromFragment,
  sha256,
} from "../lib/hash/canonicalize";

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

async function main() {
  const hash = await sha256("Testzeugnis");

  console.log("\nbuildVerifyUrl");
  const url = buildVerifyUrl("https://zeugnio.ch", hash);
  const parsed = new URL(url);
  check("zeigt auf /verify", parsed.pathname === "/verify");
  check("Hash steht im Fragment", parsed.hash === `#hash=${hash}`);
  check("keine Query (nichts für Server-Logs)", parsed.search === "");
  check(
    "Basis-URL mit Pfad wird ignoriert",
    new URL(buildVerifyUrl("https://test.zeugnio.ch/irgendwo", hash)).pathname ===
      "/verify",
  );

  console.log("\nreadHashFromFragment");
  check("liest aus der erzeugten URL", readHashFromFragment(parsed.hash) === hash);
  check("ohne führendes #", readHashFromFragment(`hash=${hash}`) === hash);
  check("leeres Fragment → null", readHashFromFragment("") === null);
  check("nur # → null", readHashFromFragment("#") === null);
  check("fremdes Fragment → null", readHashFromFragment("#disclaimer") === null);
  check(
    "weitere Parameter stören nicht",
    readHashFromFragment(`#x=1&hash=${hash}`) === hash,
  );

  console.log("\nnormalizeVerifyHash");
  check("gültiger Hash bleibt", normalizeVerifyHash(hash) === hash);
  check("Grossbuchstaben → klein", normalizeVerifyHash(hash.toUpperCase()) === hash);
  check("Leerraum wird entfernt", normalizeVerifyHash(`  ${hash}\n`) === hash);
  check("63 Zeichen → null", normalizeVerifyHash(hash.slice(1)) === null);
  check("65 Zeichen → null", normalizeVerifyHash(hash + "a") === null);
  check("Nicht-Hex → null", normalizeVerifyHash("g".repeat(64)) === null);
  check("SQL-Versuch → null", normalizeVerifyHash("' or 1=1 --") === null);
  check("null → null", normalizeVerifyHash(null) === null);
  check("undefined → null", normalizeVerifyHash(undefined) === null);

  console.log("\nAlte PDFs (?hash=)");
  const legacy = new URL(`https://zeugnio.ch/verify?hash=${hash}`);
  check(
    "Query-Wert wird gleich normalisiert",
    normalizeVerifyHash(legacy.searchParams.get("hash")) === hash,
  );

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
