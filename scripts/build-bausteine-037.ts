/**
 * Erzeugt Migration 037 und die Review-Datei aus scripts/data/bausteine-037-uncodiert.json.
 *
 *   npx tsx scripts/build-bausteine-037.ts
 *
 * Danach `npm run test:bausteine`: Der Test prüft die Texte und ob die erzeugten
 * Dateien zur JSON-Quelle passen.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  REVIEW_PATH,
  ROOT,
  SQL_PATH,
  loadAenderungen,
  parseSeed,
  renderReview,
  renderSql,
} from "./bausteine-037-lib";

const seed = parseSeed();
const aenderungen = loadAenderungen();

writeFileSync(SQL_PATH, renderSql(aenderungen, seed), "utf8");
writeFileSync(REVIEW_PATH, renderReview(aenderungen, seed), "utf8");

console.log(`${aenderungen.length} Bausteine → ${path.relative(ROOT, SQL_PATH)}, ${path.relative(ROOT, REVIEW_PATH)}`);
