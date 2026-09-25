/**
 * Kopiert den pdf.js-Worker aus node_modules nach public/pdfjs/.
 *
 * Vorher lud `verify-uploader.tsx` den Worker zur Laufzeit von cdnjs — das trug
 * bei jeder Zeugnisprüfung die Besucher-IP in die USA und brach still, sobald
 * cdnjs eine Version nicht führt. Die Kopie zur Buildzeit garantiert zusätzlich,
 * dass Worker- und API-Version identisch sind (pdfjs bricht sonst mit
 * "The API version does not match the Worker version" ab).
 *
 * Läuft in `prebuild` und `predev`. Die Kopie ist gitignored.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Über die Paketauflösung statt über einen fixen Pfad: funktioniert auch bei
// gehobenen/verschachtelten node_modules.
const pdfjsEntry = require.resolve("pdfjs-dist/package.json");
const source = join(dirname(pdfjsEntry), "build", "pdf.worker.min.mjs");
const targetDir = join(process.cwd(), "public", "pdfjs");
const target = join(targetDir, "pdf.worker.min.mjs");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

const { version } = require("pdfjs-dist/package.json") as { version: string };
console.log(`pdf.js-Worker kopiert (Version ${version}) → public/pdfjs/pdf.worker.min.mjs`);
