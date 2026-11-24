/**
 * Tests für die Bestätigung durch Abtippen und die Doppel-Erkennung —
 * lib/loeschen/confirm.ts.
 *
 * Ausführen:
 *   npm run test:loeschen-confirm   (bzw. npx tsx scripts/test-loeschen-confirm.ts)
 *
 * Anlass (24.11.2026): Der Browser verglich ohne, der Server mit Gross- und
 * Kleinschreibung. Bei einem Firmennamen in Grossbuchstaben wurde der Knopf aktiv
 * und der Server lehnte ab. Beide Seiten benutzen jetzt confirmationMatches.
 */

import { companyNameKey, confirmationMatches } from "../lib/loeschen/confirm";

let passed = 0;
let failed = 0;

function eq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}: erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
    failed++;
  }
}

const upper = "MUSTER Treuhand Partner AG.";
const lower = "Muster Treuhand Partner AG.";

console.log("confirmationMatches");
eq("genau gleich", confirmationMatches(upper, upper), true);
eq("andere Gross-/Kleinschreibung", confirmationMatches(lower, upper), true);
eq("Leerzeichen am Rand und doppelt", confirmationMatches("  MUSTER  Treuhand Partner AG. ", upper), true);
eq("Umlaut zerlegt (NFD) gegen zusammengesetzt", confirmationMatches("Müller AG", "Müller AG"), true);
eq("Punkt fehlt: kein Treffer", confirmationMatches("MUSTER Treuhand Partner AG", upper), false);
eq("anderer Name: kein Treffer", confirmationMatches("Treuhand Partner", upper), false);
eq("leere Eingabe", confirmationMatches("", upper), false);
eq("leerer Sollwert nie bestätigt", confirmationMatches("", "  "), false);
eq("keine Zeichenkette", confirmationMatches(undefined, upper), false);
eq("E-Mail-Adresse", confirmationMatches("Anna@Example.CH ", "anna@example.ch"), true);

console.log("companyNameKey");
eq("Doppel trotz Schreibweise", companyNameKey(upper) === companyNameKey("muster treuhand partner ag"), true);
eq("Umlaute bleiben unterscheidbar", companyNameKey("Müller AG") === companyNameKey("Muller AG"), false);
eq("anderer Name", companyNameKey(upper) === companyNameKey("Beispiel Advisory AG"), false);
eq("nur Satzzeichen ergibt leer", companyNameKey(" .- "), "");

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
