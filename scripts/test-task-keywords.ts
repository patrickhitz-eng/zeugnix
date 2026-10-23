/**
 * Tests für die Stichwort-Formatierung der Aufgaben.
 *
 *   npm run test:tasks   (bzw. npx tsx scripts/test-task-keywords.ts)
 *
 * Eine eingefrorene Tabelle aus Eingabe und erwarteter Ausgabe. Das ist hier
 * kein Stilmittel, sondern die Anforderung: der Zeugnistext geht in den
 * SHA-256-Hash ein, also muss dieselbe Eingabe IMMER dieselbe Ausgabe ergeben.
 * Ändert jemand eine Regel, wird genau sichtbar, welche Formulierungen sich
 * dadurch verschieben.
 *
 * R7 ist die Aufzählung (Entscheid Auftraggeber, 23.10.2026) – nicht
 * Fliesstext.
 */

import {
  cleanTaskKeywords,
  dedupeTaskKeywords,
  formatTaskBlock,
  normalizeTaskKeyword,
  taskBulletBlock,
} from "../lib/certificate/task-keywords";

let passed = 0;
let failed = 0;

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}\n      erwartet ${e}\n      war      ${a}`);
    failed++;
  }
}

console.log("\n=== Stichwort-Formatierung ===\n");

// ---------------------------------------------------------------------------
console.log("R2 – vorangestellte Listenzeichen entfernen");
for (const marker of ["- ", "– ", "— ", "• ", "* ", "· ", "1. ", "2) "]) {
  eq(
    `"${marker}Beratung" -> "Beratung"`,
    normalizeTaskKeyword(`${marker}Beratung`),
    "Beratung",
  );
}
eq(
  "Bindestrich OHNE Leerzeichen ist ein Wortteil, kein Listenzeichen",
  normalizeTaskKeyword("-Beratung"),
  "-Beratung",
);

// ---------------------------------------------------------------------------
console.log("\nR3 – innen aufräumen");
eq(
  "mehrfacher Whitespace -> ein Space",
  normalizeTaskKeyword("Beratung   von \t Geschäftskunden"),
  "Beratung von Geschäftskunden",
);
eq(
  "Leerzeichen vor Satzzeichen weg",
  normalizeTaskKeyword("Beratung von Privat- , Firmen- und Grosskunden"),
  "Beratung von Privat-, Firmen- und Grosskunden",
);
eq(
  "doppelte Trennzeichen auf eines",
  normalizeTaskKeyword("Beratung,, Buchhaltung"),
  "Beratung, Buchhaltung",
);

// ---------------------------------------------------------------------------
console.log("\nR4 – Satzzeichen am Ende entfernen");
for (const end of [".", ",", ";", ":", "...", " ."]) {
  eq(
    `"Beratung${end}" -> "Beratung"`,
    normalizeTaskKeyword(`Beratung${end}`),
    "Beratung",
  );
}
eq(
  "Abkürzungspunkt INNERHALB bleibt",
  normalizeTaskKeyword("Betreuung der Kundschaft inkl. Reporting"),
  "Betreuung der Kundschaft inkl. Reporting",
);

// ---------------------------------------------------------------------------
console.log("\nR5 – nur der erste Buchstabe");
eq(
  "klein geschrieben -> erster Buchstabe gross",
  normalizeTaskKeyword("beratung von Geschäftskunden"),
  "Beratung von Geschäftskunden",
);
eq(
  "Binnengrossschreibung bleibt unangetastet",
  normalizeTaskKeyword("betreuung der SAP-Schnittstelle"),
  "Betreuung der SAP-Schnittstelle",
);
eq(
  "Substantive im Satzinneren werden NICHT angefasst",
  normalizeTaskKeyword("Beratung von Geschäftskunden"),
  "Beratung von Geschäftskunden",
);
eq(
  "Grossbuchstaben bleiben, wie sie getippt wurden",
  normalizeTaskKeyword("BERATUNG VON GESCHÄFTSKUNDEN"),
  "BERATUNG VON GESCHÄFTSKUNDEN",
);
eq("Umlaut am Anfang", normalizeTaskKeyword("überwachung der Fristen"), "Überwachung der Fristen");
eq("leer bleibt leer", normalizeTaskKeyword("   •   "), "");

// ---------------------------------------------------------------------------
console.log("\nR1 – zerlegen an Zeilenumbruch und Semikolon, NICHT am Komma");
eq(
  "Semikolon trennt",
  cleanTaskKeywords("Beratung; Buchhaltung; Schulung"),
  ["Beratung", "Buchhaltung", "Schulung"],
);
eq(
  "Komma trennt NICHT – es gehört zur Aufzählung innerhalb eines Eintrags",
  cleanTaskKeywords("Beratung von Privat-, Firmen- und institutionellen Kunden"),
  ["Beratung von Privat-, Firmen- und institutionellen Kunden"],
);
eq(
  "leere Zeilen fallen weg",
  cleanTaskKeywords("Beratung\n\n\nBuchhaltung\n   \n"),
  ["Beratung", "Buchhaltung"],
);

// ---------------------------------------------------------------------------
console.log("\nR6 – Dubletten");
eq(
  "exakte Dublette",
  dedupeTaskKeywords(["Beratung", "Buchhaltung", "Beratung"]),
  ["Beratung", "Buchhaltung"],
);
eq(
  "Dublette nur in Gross-/Kleinschreibung",
  cleanTaskKeywords("Beratung von Kunden\nberatung von kunden"),
  ["Beratung von Kunden"],
);
eq(
  "Dublette nur im Whitespace",
  cleanTaskKeywords("Beratung  von Kunden\nBeratung von Kunden"),
  ["Beratung von Kunden"],
);
eq(
  "erster Treffer behält seine Schreibweise und Position",
  cleanTaskKeywords("SAP-Betreuung\nBuchhaltung\nsap-betreuung"),
  ["SAP-Betreuung", "Buchhaltung"],
);

// ---------------------------------------------------------------------------
console.log("\nR8 – Reproduzierbarkeit (der Hash hängt daran)");
{
  const input =
    "  • beratung von Geschäftskunden;\n\nVORBEREITUNG DER ABSCHLÜSSE.\n- schulung neuer Mitarbeitender,\nberatung von geschäftskunden\n";
  const once = cleanTaskKeywords(input);
  const twice = cleanTaskKeywords(input);
  eq("zweimal dieselbe Eingabe -> identische Ausgabe", once, twice);
  eq("vollständiges Beispiel", once, [
    "Beratung von Geschäftskunden",
    "VORBEREITUNG DER ABSCHLÜSSE",
    "Schulung neuer Mitarbeitender",
  ]);
  eq(
    "Array-Eingabe (DB-Spalte) ergibt dasselbe wie die Textarea",
    cleanTaskKeywords(input.split("\n")),
    once,
  );
}

// ---------------------------------------------------------------------------
console.log("\nR7 – Aufzählung zusammensetzen");
eq(
  "Aufzählungszeichen und einfache Umbrüche",
  taskBulletBlock(["Beratung", "Buchhaltung"]),
  "• Beratung\n• Buchhaltung",
);
eq("leere Liste -> leerer Block", taskBulletBlock([]), "");
eq(
  "ein Eintrag bekommt trotzdem sein Zeichen",
  taskBulletBlock(["Beratung"]),
  "• Beratung",
);
eq(
  "R1–R7 am Stück",
  formatTaskBlock("- beratung von Kunden;\nBUCHHALTUNG.\nberatung von kunden"),
  "• Beratung von Kunden\n• BUCHHALTUNG",
);
eq(
  "Eingabe nur aus Listenzeichen und Leerraum -> leerer Block",
  formatTaskBlock("•\n  \n- \n;;"),
  "",
);

// ---------------------------------------------------------------------------
console.log("\nIdempotenz – trägt das Säubern an ZWEI Stellen");
{
  // Gesäubert wird in app/api/certificates/route.ts (beim Anlegen) UND in
  // lib/phrases/engine.ts (beim Generieren). Das ist nur zulässig, solange ein
  // zweiter Durchlauf nichts mehr verändert.
  const inputs = [
    "- beratung von Geschäftskunden;\nVORBEREITUNG DER ABSCHLÜSSE.\nberatung von geschäftskunden",
    "Beratung von Privat-, Firmen- und institutionellen Kunden",
    "1. Erste Aufgabe\n2) Zweite Aufgabe",
    "Betreuung der Kundschaft inkl. Reporting",
    "überwachung der Fristen  ,  Mahnwesen",
    "",
  ];
  for (const input of inputs) {
    const once = cleanTaskKeywords(input);
    const twice = cleanTaskKeywords(once);
    eq(`zweiter Durchlauf ändert nichts: ${JSON.stringify(input.slice(0, 34))}`, twice, once);
  }
  // Auch über den fertigen Block hinweg: der Block enthält Aufzählungszeichen,
  // die R2 beim erneuten Säubern wieder entfernen muss, ohne etwas zu verlieren.
  const block = formatTaskBlock("beratung\nbuchhaltung");
  eq(
    "Block erneut gesäubert ergibt denselben Block",
    formatTaskBlock(block.split("\n")),
    block,
  );
}

console.log(`\n--- ${passed} bestanden, ${failed} fehlgeschlagen ---\n`);
if (failed > 0) process.exit(1);
