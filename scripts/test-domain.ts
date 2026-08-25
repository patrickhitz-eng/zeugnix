/**
 * Tests für die Domain-Verifikations-Logik (V1) — lib/company/domain.ts.
 *
 * Ausführen:
 *   npm run test:domain   (bzw. npx tsx scripts/test-domain.ts)
 *
 * Diese Funktionen sind der Trust-Anker der Aussteller-Verifikation: eine
 * fehlerhafte Normalisierung oder ein Loch in der Freemail-Blocklist würde
 * die Domain-Verifikation aushebelbar machen. Daher hart getestet.
 */

import {
  normalizeDomain,
  emailDomain,
  isFreeMailDomain,
  domainsMatch,
} from "../lib/company/domain";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(name, a === e, `erwartet ${e}, war ${a}`);
}

console.log("\nnormalizeDomain: Protokoll/Pfad/Port/www strippen");
eq("bloße Domain", normalizeDomain("firma.ch"), "firma.ch");
eq("Grossschreibung", normalizeDomain("Firma.CH"), "firma.ch");
eq("mit https + www", normalizeDomain("https://www.firma.ch"), "firma.ch");
eq("mit Pfad", normalizeDomain("https://www.firma.ch/karriere"), "firma.ch");
eq("mit Port", normalizeDomain("firma.ch:443"), "firma.ch");
eq("umgebende Spaces", normalizeDomain("  firma.ch  "), "firma.ch");
eq("Subdomain bleibt", normalizeDomain("hr.firma.ch"), "hr.firma.ch");
eq("E-Mail -> Domain", normalizeDomain("silvan@firma.ch"), "firma.ch");

console.log("\nnormalizeDomain: IDN -> punycode");
eq("Umlaut-Domain", normalizeDomain("müller.ch"), "xn--mller-kva.ch");
eq("Umlaut mit www", normalizeDomain("https://www.Müller.ch"), "xn--mller-kva.ch");

console.log("\nnormalizeDomain: ungültige Eingaben -> null");
eq("leer", normalizeDomain(""), null);
eq("null", normalizeDomain(null), null);
eq("ohne Punkt", normalizeDomain("localhost"), null);
eq("nur Text", normalizeDomain("ACME AG"), null);
eq("nur Punkt", normalizeDomain("."), null);
eq("führender Punkt", normalizeDomain(".firma.ch"), null);

console.log("\nemailDomain");
eq("normale E-Mail", emailDomain("silvan@firma.ch"), "firma.ch");
eq("Grossschreibung", emailDomain("Silvan.Schueck@Firma.CH"), "firma.ch");
eq("Subdomain", emailDomain("hr@mail.firma.ch"), "mail.firma.ch");
eq("kein @", emailDomain("silvan"), null);
eq("null", emailDomain(null), null);

console.log("\nisFreeMailDomain");
assert("gmail.com", isFreeMailDomain("gmail.com"));
assert("gmx.ch", isFreeMailDomain("gmx.ch"));
assert("bluewin.ch", isFreeMailDomain("bluewin.ch"));
assert("hotmail.com", isFreeMailDomain("hotmail.com"));
assert("icloud.com", isFreeMailDomain("icloud.com"));
assert("firma.ch ist KEIN Freemail", !isFreeMailDomain("firma.ch"));
assert("advisori.ch ist KEIN Freemail", !isFreeMailDomain("advisori.ch"));

console.log("\ndomainsMatch");
assert("identisch", domainsMatch("firma.ch", "firma.ch"));
assert("E-Mail-Subdomain der deklarierten", domainsMatch("firma.ch", "hr.firma.ch"));
assert("umgekehrt NICHT (E-Mail auf Parent)", !domainsMatch("hr.firma.ch", "firma.ch"));
assert("fremde Domain NICHT", !domainsMatch("firma.ch", "andere.ch"));
assert("Suffix-Trick NICHT (bösefirma.ch)", !domainsMatch("firma.ch", "bösefirma.ch"));
assert("Teilstring NICHT (firma.ch.evil.com)", !domainsMatch("firma.ch", "firma.ch.evil.com"));
assert("null links", !domainsMatch(null, "firma.ch"));
assert("null rechts", !domainsMatch("firma.ch", null));

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
