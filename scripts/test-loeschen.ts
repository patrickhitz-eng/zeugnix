/**
 * Test für Export und Prüfregister (Schritt 17).
 *
 *   npm run test:loeschen        (dieser Test, ohne Datenbank)
 *   npm run test:loeschen-db     (scripts/test-loeschen.sql gegen eine Wegwerf-DB)
 *
 * Prüft:
 *   1. ZIP-Schreiber: Ein fremdes Programm (jszip) liest alle Dateien zurück,
 *      komprimierte wie abgelegte, Umlaute im Namen inklusive.
 *   2. CSV: Excel-tauglich (BOM, Semikolon) und mit Formel-Schutz.
 *   3. Prüfung: Ein Hash, den es nur noch im Register gibt, wird gefunden und
 *      als Register-Treffer ohne Namen ausgegeben; ins Prüfprotokoll geht keine
 *      ID, die es in certificates nicht mehr gibt.
 *   4. Fehlercodes der Löschfunktionen werden zu den richtigen HTTP-Status.
 */
import JSZip from "jszip"; // kommt mit dem Paket «docx»; nur der Test liest damit
import { buildZip, crc32 } from "../lib/export/zip";
import { buildCsv } from "../lib/export/csv";
import {
  buildCertificateFields,
  findCertificateByHash,
  findRegisterByBodyHash,
  matchedCertificateIdForLog,
} from "../lib/verify/certificate-fields";
import { deletionErrorStatus } from "../lib/loeschen/rpc-error";
import { RETENTION, cutoffIso } from "../lib/retention";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

/** Minimaler Nachbau des Supabase-Clients: liefert pro Tabelle eine feste Zeile. */
function fakeClient(rows: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<(r: any) => boolean> = [];
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => (filters.push((r) => r[col] === val), q),
        gte: (col: string, val: any) => (filters.push((r) => r[col] >= val), q),
        in: (col: string, vals: any[]) => (filters.push((r) => vals.includes(r[col])), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: (rows[table] ?? []).find((r) => filters.every((f) => f(r))) ?? null }),
      };
      return q;
    },
  };
}

async function main() {
  // ---------------------------------------------------------------- 1. ZIP
  console.log("ZIP-Schreiber:");
  {
    const pdfLike = Buffer.from("%PDF-1.7 " + "x".repeat(5000));
    const zip = buildZip([
      { name: "pdf/Arbeitszeugnis_Müller_Jürg.pdf", data: pdfLike, compress: false },
      { name: "zeugnisse.csv", data: "a;b\r\nÄ;ö\r\n".repeat(200) },
      { name: "LIESMICH.txt", data: "" },
    ]);
    const read = await JSZip.loadAsync(zip);
    const names = Object.keys(read.files).sort();
    check("alle drei Dateien im Archiv", names.length === 3, names.join(", "));
    check("Umlaute im Dateinamen bleiben", names.includes("pdf/Arbeitszeugnis_Müller_Jürg.pdf"));
    const pdfBack = await read.file("pdf/Arbeitszeugnis_Müller_Jürg.pdf")!.async("nodebuffer");
    check("abgelegte Datei byte-genau zurück", pdfBack.equals(pdfLike));
    const csvBack = await read.file("zeugnisse.csv")!.async("string");
    check("komprimierte Datei inhaltsgleich zurück", csvBack === "a;b\r\nÄ;ö\r\n".repeat(200));
    check("leere Datei geht", (await read.file("LIESMICH.txt")!.async("string")) === "");
    check("CRC-32 Referenzwert («123456789» = cbf43926)", crc32(Buffer.from("123456789")).toString(16) === "cbf43926");
  }

  // ---------------------------------------------------------------- 2. CSV
  console.log("\nCSV:");
  {
    const csv = buildCsv(["name", "funktion", "aktiv"], [
      ["Müller; Jürg", '=HYPERLINK("x")', true],
      ["Anna", "-Leitung", null],
    ]);
    check("beginnt mit BOM", csv.startsWith("﻿"));
    check("Semikolon im Feld wird gequotet", csv.includes('"Müller; Jürg"'));
    check("Formel wird entschärft", csv.includes(`"'=HYPERLINK(""x"")"`), csv);
    check("Minus am Anfang wird entschärft", csv.includes("'-Leitung"));
    check("Boolean als ja/nein", csv.includes(";ja"));
    check("Zeilenende CRLF", csv.split("\r\n").length === 4);
  }

  // ---------------------------------------------------------------- 3. Prüfung
  console.log("\nPrüfung gegen das Register:");
  {
    const entry = {
      certificate_id: "11111111-1111-1111-1111-111111111111",
      hash: "a".repeat(64),
      body_hash: "b".repeat(64),
      hash_version: 2,
      status: "revoked",
      finalized_at: "2026-01-15T10:00:00Z",
      revoked_at: "2026-03-01T10:00:00Z",
      signature: "sig",
      signing_key_id: "kid",
      employer: "Muster AG",
      document_title: "Arbeitszeugnis",
      verified_domain: "muster.ch",
    };
    const client = fakeClient({ certificates: [], certificate_register: [entry] });

    const match: any = await findCertificateByHash(client, "a".repeat(64));
    check("Hash nur im Register wird gefunden", !!match && match.fromRegister === true);
    check("Status und Widerruf kommen mit", match?.status === "revoked" && match?.revoked_at === entry.revoked_at);
    check("ins Prüfprotokoll keine gelöschte ID", matchedCertificateIdForLog(match) === null);
    check("normale Treffer behalten ihre ID", matchedCertificateIdForLog({ id: "x" }) === "x");

    const fields = await buildCertificateFields(client, match);
    check("Arbeitgeber, Titel und Domain aus dem Register", fields.employer === "Muster AG" && fields.documentType === "Arbeitszeugnis" && fields.verifiedDomain === "muster.ch");
    check("kein Name, keine Unterzeichnenden", fields.employeeName === "" && fields.signatory1Name === null && fields.signatory2Name === null);
    check("Register-Hinweis gesetzt", fields.fromRegister === true && fields.sealVersion === 2);

    const viaBody: any = await findRegisterByBodyHash(client, "b".repeat(64));
    check("Text-Hash trifft v2-Eintrag (Kopf/Unterschrift getauscht)", viaBody?.fromRegister === true);
    const v1Client = fakeClient({ certificate_register: [{ ...entry, hash_version: 1 }] });
    check("Text-Hash zählt bei v1 nicht als Mismatch", (await findRegisterByBodyHash(v1Client, "b".repeat(64))) === null);
    check("unbekannter Hash bleibt unbekannt", (await findCertificateByHash(client, "c".repeat(64))) === null);

    const live = fakeClient({ certificates: [{ id: "live", hash: "a".repeat(64), status: "final" }], certificate_register: [entry] });
    const liveMatch: any = await findCertificateByHash(live, "a".repeat(64));
    check("lebendes Zeugnis geht vor Register", liveMatch?.id === "live" && !liveMatch?.fromRegister);
  }

  // ---------------------------------------------------------------- 4. Fehlercodes, Fristen
  console.log("\nFehlercodes und Fristen:");
  check("42501 → 403", deletionErrorStatus({ code: "42501" }) === 403);
  check("P0002 → 404", deletionErrorStatus({ code: "P0002" }) === 404);
  check("23514 (letzte Admin-Person) → 409", deletionErrorStatus({ code: "23514" }) === 409);
  check("sonst → 500", deletionErrorStatus({ code: "XX000" }) === 500);
  check(
    "Frist rechnet in Tagen",
    cutoffIso(RETENTION.verifyUploadsDays, Date.parse("2026-11-13T00:00:00Z")) === "2026-05-17T00:00:00.000Z",
  );

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
