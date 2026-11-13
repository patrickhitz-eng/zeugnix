/**
 * CSV für den Datenexport, so dass Excel in der Schweiz sie direkt öffnet:
 * Semikolon als Trenner, UTF-8 mit BOM (sonst zeigt Excel Umlaute falsch),
 * Zeilenende CRLF.
 *
 * Formel-Schutz: Eine Zelle, die mit = + - @ oder einem Tabulator beginnt,
 * führt Excel als Formel aus. Mitarbeitende-Namen und Funktionen kommen aus
 * Eingabefeldern; darum bekommt so eine Zelle ein vorangestelltes Hochkomma.
 */

export type CsvValue = string | number | boolean | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "ja" : "nein") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  if (/[;"\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function buildCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
