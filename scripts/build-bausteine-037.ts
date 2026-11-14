/**
 * Erzeugt aus scripts/data/bausteine-037-uncodiert.json die Review-Datei und, falls
 * Texte noch nicht eingespielt sind, eine Folgemigration.
 *
 *   npm run bausteine:build
 *       Review neu schreiben. Gibt es Änderungen gegenüber dem eingespielten Stand,
 *       entsteht supabase/<NNN>_bausteine_korrekturen.sql (oder die schon offene
 *       Folgemigration wird überschrieben). Ohne Änderungen wird eine offene,
 *       leer gewordene Folgemigration gelöscht.
 *
 *   npx tsx scripts/build-bausteine-037.ts --eingespielt 038_bausteine_korrekturen.sql
 *       Nach dem Einspielen in Supabase: Datei mit SHA-256 und Datum in
 *       scripts/data/bausteine-eingespielt.json eintragen. Ab dann ist sie eingefroren.
 *
 * Danach `npm run test:bausteine`.
 *
 * Warum so: 037 läuft seit 13.11.2026 in der Produktion. Eine eingespielte Migration
 * darf sich nicht mehr ändern, sonst passt die Datei im Repo nicht mehr zur Datenbank,
 * und auf dem neuen Server (scripts/migrate.mjs) liefe ein anderer Text als in Supabase.
 */

import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EINGESPIELT_PATH,
  REVIEW_PATH,
  ROOT,
  SUPABASE_DIR,
  loadAenderungen,
  loadEingespielt,
  naechsteNummer,
  offeneDateien,
  offeneZeilen,
  parseSeed,
  renderFolgemigration,
  renderReview,
  sha256Datei,
} from "./bausteine-037-lib";

const INFO =
  "Bausteine-Migrationen, die in Supabase-Prod eingespielt sind. Eingefroren: Der Test vergleicht den SHA-256 (über LF-Zeilenenden). Eintragen mit `npx tsx scripts/build-bausteine-037.ts --eingespielt <datei>`.";

const rel = (p: string) => path.relative(ROOT, p);
const args = process.argv.slice(2);

// --- Eintragen einer eingespielten Migration --------------------------------
const iEin = args.indexOf("--eingespielt");
if (iEin >= 0) {
  const datei = args[iEin + 1];
  if (!datei) throw new Error("--eingespielt braucht einen Dateinamen, z. B. 038_bausteine_korrekturen.sql");
  const file = path.join(SUPABASE_DIR, path.basename(datei));
  if (!existsSync(file)) throw new Error(`${rel(file)} gibt es nicht`);
  const liste = loadEingespielt();
  if (liste.some((e) => e.datei === path.basename(datei))) {
    console.log(`${path.basename(datei)} ist schon eingetragen.`);
    process.exit(0);
  }
  const heute = new Date().toISOString().slice(0, 10);
  liste.push({ datei: path.basename(datei), sha256: sha256Datei(file), eingespielt: heute });
  writeFileSync(EINGESPIELT_PATH, JSON.stringify({ _info: INFO, migrationen: liste }, null, 2) + "\n", "utf8");
  console.log(`${path.basename(datei)} als eingespielt eingetragen (${heute}).`);
  process.exit(0);
}

// --- Normaler Lauf ----------------------------------------------------------
const seed = parseSeed();
const aenderungen = loadAenderungen();

writeFileSync(REVIEW_PATH, renderReview(aenderungen, seed), "utf8");
console.log(`Review: ${rel(REVIEW_PATH)}`);

const offen = offeneZeilen(seed, aenderungen);
const dateien = offeneDateien();
if (dateien.length > 1) {
  throw new Error(`Mehr als eine offene Bausteine-Migration: ${dateien.join(", ")}. Erst eine eintragen oder löschen.`);
}

if (offen.length === 0) {
  if (dateien.length === 1) {
    unlinkSync(path.join(SUPABASE_DIR, dateien[0]));
    console.log(`Nichts mehr offen: ${dateien[0]} gelöscht.`);
  } else {
    console.log("Nichts offen: Die Datenbank hat schon alle Texte aus der JSON-Quelle.");
  }
} else {
  const datei = dateien[0] ?? `${naechsteNummer()}_bausteine_korrekturen.sql`;
  writeFileSync(path.join(SUPABASE_DIR, datei), renderFolgemigration(datei, offen), "utf8");
  console.log(`Folgemigration: supabase/${datei} (${offen.length} Zeilen)`);
  console.log("Nach dem Einspielen in Supabase eintragen:");
  console.log(`  npx tsx scripts/build-bausteine-037.ts --eingespielt ${datei}`);
}
