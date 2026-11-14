/**
 * Gemeinsame Logik für die uncodierten Bausteine «genügend»/«ungenügend» (037 ff.).
 *
 * Eine Quelle, zwei Ausgaben:
 *   scripts/data/bausteine-037-uncodiert.json   ← hier werden die Texte gepflegt
 *     ├─ supabase/<NNN>_bausteine_korrekturen.sql (Folgemigration, nur was noch nicht eingespielt ist)
 *     └─ docs/bausteine-ungenuegend-review.md    (Gegenüberstellung 009 → heute, für die HR-Prüfung)
 *
 * Eingespielte Migrationen (zuerst 037) stehen mit SHA-256 in
 * scripts/data/bausteine-eingespielt.json und sind eingefroren.
 *
 * Erzeugen:  npm run bausteine:build
 * Eintragen: npx tsx scripts/build-bausteine-037.ts --eingespielt <datei>
 * Prüfen:    npm run test:bausteine
 *
 * Der alte Text kommt aus supabase/009_seed_bausteine.sql. Der Seed enthält bereits
 * die Korrekturen aus 014 und 028 (siehe deren Kopf), entspricht also dem Stand
 * vor 037.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SKILLS } from "../lib/phrases/skills";

export const ROOT = path.join(__dirname, "..");
export const SUPABASE_DIR = path.join(ROOT, "supabase");
export const SEED_PATH = path.join(SUPABASE_DIR, "009_seed_bausteine.sql");
export const DATA_PATH = path.join(ROOT, "scripts", "data", "bausteine-037-uncodiert.json");
export const EINGESPIELT_PATH = path.join(ROOT, "scripts", "data", "bausteine-eingespielt.json");
export const REVIEW_PATH = path.join(ROOT, "docs", "bausteine-ungenuegend-review.md");

export type Rating = "ungenuegend" | "genuegend" | "gut" | "sehr_gut";
export type Tempus = "praesens" | "praeteritum";

export interface SeedRow {
  category: string;
  subcategory: string;
  employeeType: string;
  gender: string;
  rating: Rating;
  variant: number;
  tempus: Tempus;
  text: string;
}

export interface Aenderung {
  key: string; // category|rating|variant
  category: string;
  rating: Rating;
  variant: number;
  praesens: string;
  praeteritum: string;
  warum: string;
}

/** Schlüssel einer Zeile ohne Tempus: so adressiert die JSON-Datei einen Baustein. */
export function keyOf(r: { category: string; rating: string; variant: number }): string {
  return `${r.category}|${r.rating}|${r.variant}`;
}

// ---------------------------------------------------------------------------
// Einlesen
// ---------------------------------------------------------------------------

const SQL_STRING = "'((?:[^']|'')*)'";
const SEED_LINE = new RegExp(
  `^\\(${SQL_STRING}, ${SQL_STRING}, ${SQL_STRING}, ${SQL_STRING}, ${SQL_STRING}, (\\d+), ${SQL_STRING}, ${SQL_STRING}\\)[,;]$`,
);

export function parseSeed(file = SEED_PATH): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = SEED_LINE.exec(line);
    if (!m) continue;
    const un = (s: string) => s.replace(/''/g, "'");
    rows.push({
      category: un(m[1]),
      subcategory: un(m[2]),
      employeeType: un(m[3]),
      gender: un(m[4]),
      rating: un(m[5]) as Rating,
      variant: Number(m[6]),
      tempus: un(m[7]) as Tempus,
      text: un(m[8]),
    });
  }
  return rows;
}

export function loadAenderungen(file = DATA_PATH): Aenderung[] {
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    aenderungen: Record<string, { praesens: string; praeteritum: string; warum: string }>;
  };
  return Object.entries(json.aenderungen).map(([key, v]) => {
    const [category, rating, variant] = key.split("|");
    return {
      key,
      category,
      rating: rating as Rating,
      variant: Number(variant),
      praesens: v.praesens,
      praeteritum: v.praeteritum,
      warum: v.warum,
    };
  });
}

// ---------------------------------------------------------------------------
// Prüfregeln (vom Test genutzt, hier, damit Generator und Test dieselben kennen)
// ---------------------------------------------------------------------------

/**
 * Codewörter und Abschwächer, die in «genügend»/«ungenügend» nicht vorkommen dürfen.
 * Grundlage: gängige Zeugniscode-Listen (u. a. Häusermann) und lib/phrases/analyze.ts.
 * Regex, ohne Gross-/Kleinschreibung. \b wo ein Wortteil sonst falsch trifft
 * (z. B. «meist» in «meistert»).
 */
export const CODEWOERTER: Array<{ re: RegExp; warum: string }> = [
  { re: /bemüh/i, warum: "«bemüht» = Mühe ohne Erfolg" },
  { re: /im grossen und ganzen/i, warum: "Abschwächer" },
  { re: /pünktlich/i, warum: "Lob für Selbstverständliches" },
  { re: /möglichkeiten entsprechend/i, warum: "= überfordert" },
  { re: /im rahmen (seiner|ihrer|\{\{seiner)/i, warum: "= überfordert" },
  { re: /\bversucht/i, warum: "Versuch ohne Erfolg" },
  { re: /\binteress/i, warum: "Interesse ohne Leistung" },
  { re: /\bjeweils\b/i, warum: "= nicht durchgehend" },
  { re: /\bsolide/i, warum: "Abschwächer" },
  { re: /\bmeist(ens)?\b/i, warum: "= nicht immer" },
  { re: /grösstenteils/i, warum: "Abschwächer" },
  { re: /weitgehend/i, warum: "Abschwächer" },
  { re: /mehrheitlich/i, warum: "Abschwächer" },
  { re: /im allgemeinen/i, warum: "Abschwächer" },
  { re: /in der regel/i, warum: "Abschwächer" },
  { re: /grundsätzlich/i, warum: "= mit Ausnahmen" },
  { re: /von zeit zu zeit/i, warum: "Abschwächer" },
  { re: /im wesentlichen/i, warum: "Abschwächer" },
  { re: /lernten wir|wir lernten|kennen ?gelernt/i, warum: "Eindruck hat sich nicht bestätigt" },
  { re: /möchten erwähnen/i, warum: "hebt Nebensächliches hervor" },
  { re: /zufrieden/i, warum: "Zufriedenheitsformel" },
  { re: /den vorgaben (gemäss|entsprechend)/i, warum: "Dienst nach Vorschrift" },
  { re: /erwartungsgemäss/i, warum: "mehrdeutig" },
  { re: /\bangebracht/i, warum: "Abschwächer" },
  { re: /akzeptiert/i, warum: "= geduldet" },
  { re: /\bordnet(e)? sich|einzuordnen/i, warum: "Unterordnung ohne Beitrag" },
  { re: /überlegt(e)? sich/i, warum: "= tut es nicht" },
  { re: /strebt/i, warum: "Anstreben ohne Erreichen" },
  { re: /gewissenhaft/i, warum: "Codewort laut analyze.ts" },
  { re: /ordnungsgemäss/i, warum: "das Mindeste" },
  { re: /ausreichendem masse/i, warum: "Abschwächer" },
  { re: /angenehm/i, warum: "Umgänglichkeit ohne Leistung" },
  { re: /\bteilweise\b|\bteils\b|\bzum teil\b/i, warum: "vage" },
  { re: /fleiss/i, warum: "Einsatz ohne Ergebnis" },
  { re: /geselligkeit|betriebsklima|einfühlungsvermögen/i, warum: "klassischer Code" },
  { re: /verständnis für/i, warum: "klassischer Code" },
  { re: /nicht unerheblich|nicht unwesentlich|nicht unumstritten/i, warum: "doppelte Verneinung" },
  { re: /\b(galt|gilt) als\b/i, warum: "Distanzierung" },
  { re: /keine unsicherheiten/i, warum: "Lob durch Verneinung" },
  { re: /massvoll/i, warum: "Abschwächer" },
  // aus der Notenskala, die Christoph Senn am 7.7.2026 geschickt hat (Noten 5 und 6)
  { re: /nach kräften/i, warum: "Notenskala: ungenügend" },
  { re: /gelegenheit/i, warum: "Notenskala: «hatte Gelegenheit … kennenzulernen»" },
  { re: /kennen ?zu ?lernen/i, warum: "Notenskala: mangelhaft" },
  { re: /ohne schwierigkeiten/i, warum: "Notenskala: mangelhaft" },
  { re: /verständnisvoll/i, warum: "Notenskala: «verständnisvoller Vorgesetzter»" },
  { re: /(gab|gibt|erteilt|erteilte) (\S+ )?klare (handlungs)?anweisungen/i, warum: "Notenskala: «gab klare Anweisungen» bei Führungskräften" },
];

/** Einfache Platzhalter, die lib/phrases/engine.ts ersetzt. */
export const PLATZHALTER = new Set([
  "vorname",
  "nachname",
  "funktion",
  "eintritt",
  "austritt",
  "neue_funktion",
  "neue_firma",
]);

/** Gender-Tokens {{m|f|d}} und einfache Platzhalter {x}, sortiert (für Vergleiche). */
export function tokens(text: string): { gender: string[]; simple: string[] } {
  const gender = [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]).sort();
  const ohneGender = text.replace(/\{\{[^{}]*\}\}/g, "");
  const simple = [...ohneGender.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).sort();
  return { gender, simple };
}

// ---------------------------------------------------------------------------
// Ausgabe 1: Migrationen
// ---------------------------------------------------------------------------
//
// 037 ist am 13.11.2026 in Supabase-Prod eingespielt und damit eingefroren. Jede
// spätere Korrektur der Texte wird zu einer eigenen Folgemigration:
//
//   Soll-Stand  = 009 + scripts/data/bausteine-037-uncodiert.json
//   Ist-Stand   = 009 + alle Migrationen in scripts/data/bausteine-eingespielt.json
//   offen       = Soll − Ist  →  supabase/<NNN>_bausteine_korrekturen.sql
//
// Ist eine Folgemigration eingespielt, trägt `--eingespielt <datei>` sie mit ihrem
// SHA-256 in bausteine-eingespielt.json ein. Ab dann gilt sie als Ist-Stand, und der
// Test schlägt an, sobald jemand sie nachträglich ändert.

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Zeile einer Bausteine-Migration: ein Baustein in einem Tempus. */
export interface MigrationsZeile {
  category: string;
  subcategory: string;
  employeeType: string;
  rating: Rating;
  variant: number;
  tempus: Tempus;
  text: string;
}

export interface Eingespielt {
  datei: string;
  sha256: string;
  eingespielt: string; // Datum, an dem die Migration in Supabase-Prod lief
}

/** Markiert Migrationen, die dieses Skript erzeugt hat (auch 037). */
export const GENERATOR_MARKER = /^-- GENERIERT von scripts\/build-bausteine-037\.ts/m;

/** SHA-256 über den Inhalt mit LF-Zeilenenden (Git kann unter Windows CRLF auschecken). */
export function sha256Datei(file: string): string {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function loadEingespielt(file = EINGESPIELT_PATH): Eingespielt[] {
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { migrationen: Eingespielt[] }).migrationen;
}

const VALUES_ROW = new RegExp(
  `\\(${SQL_STRING}, ${SQL_STRING}, ${SQL_STRING}, ${SQL_STRING}, (\\d+), ${SQL_STRING},\\s*${SQL_STRING}\\)`,
  "g",
);

/** Liest die Zeilen aus dem INSERT einer generierten Bausteine-Migration zurück. */
export function parseMigration(file: string): MigrationsZeile[] {
  const sql = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const start = sql.indexOf("values\n");
  const end = sql.indexOf(";\n", start);
  if (start < 0 || end < 0) throw new Error(`${path.basename(file)}: kein INSERT … values gefunden`);
  const un = (s: string) => s.replace(/''/g, "'");
  return [...sql.slice(start, end).matchAll(VALUES_ROW)].map((m) => ({
    category: un(m[1]),
    subcategory: un(m[2]),
    employeeType: un(m[3]),
    rating: un(m[4]) as Rating,
    variant: Number(m[5]),
    tempus: un(m[6]) as Tempus,
    text: un(m[7]),
  }));
}

const zKey = (r: { category: string; rating: string; variant: number; tempus: string }) =>
  `${r.category}|${r.rating}|${r.variant}|${r.tempus}`;

/** Text pro Baustein nach 009 und allen eingespielten Bausteine-Migrationen. */
export function istStand(seed: SeedRow[], eingespielt = loadEingespielt()): Map<string, string> {
  const stand = new Map(seed.map((r) => [zKey(r), r.text]));
  for (const e of eingespielt) {
    for (const z of parseMigration(path.join(SUPABASE_DIR, e.datei))) stand.set(zKey(z), z.text);
  }
  return stand;
}

/** Text pro Baustein, wie ihn die JSON-Quelle verlangt (009 plus Änderungen). */
export function sollStand(seed: SeedRow[], aenderungen: Aenderung[]): Map<string, string> {
  const stand = new Map(seed.map((r) => [zKey(r), r.text]));
  for (const a of aenderungen) {
    for (const t of ["praesens", "praeteritum"] as const) {
      const k = `${a.key}|${t}`;
      if (!stand.has(k)) throw new Error(`${a.key} (${t}) fehlt in 009_seed_bausteine.sql`);
      stand.set(k, a[t]);
    }
  }
  return stand;
}

/** Bausteine, deren Soll-Text noch nicht eingespielt ist, in Seed-Reihenfolge. */
export function offeneZeilen(seed: SeedRow[], aenderungen: Aenderung[], eingespielt = loadEingespielt()): MigrationsZeile[] {
  const ist = istStand(seed, eingespielt);
  const soll = sollStand(seed, aenderungen);
  return seed
    .filter((r) => soll.get(zKey(r)) !== ist.get(zKey(r)))
    .map((r) => ({
      category: r.category,
      subcategory: r.subcategory,
      employeeType: r.employeeType,
      rating: r.rating,
      variant: r.variant,
      tempus: r.tempus,
      text: soll.get(zKey(r))!,
    }));
}

/** Generierte Bausteine-Migrationen, die noch nicht als eingespielt eingetragen sind. */
export function offeneDateien(eingespielt = loadEingespielt()): string[] {
  const bekannt = new Set(eingespielt.map((e) => e.datei));
  return readdirSync(SUPABASE_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && !bekannt.has(f))
    .filter((f) => GENERATOR_MARKER.test(readFileSync(path.join(SUPABASE_DIR, f), "utf8")))
    .sort();
}

/** Nächste freie Migrationsnummer unter 900 (900 ff. sind Handskripte für nine). */
export function naechsteNummer(): string {
  const nummern = readdirSync(SUPABASE_DIR)
    .map((f) => /^(\d{3})_/.exec(f)?.[1])
    .filter((n): n is string => !!n)
    .map(Number)
    .filter((n) => n < 900);
  return String(Math.max(0, ...nummern) + 1).padStart(3, "0");
}

/** SQL einer Folgemigration: dieselbe Mechanik wie 037 (Temp-Tabelle, UPDATE, Prüfblock). */
export function renderFolgemigration(datei: string, zeilen: MigrationsZeile[]): string {
  const nummer = datei.slice(0, 3);
  const tmp = `_bausteine_${nummer}`;
  const anzahlBausteine = new Set(zeilen.map((z) => `${z.category}|${z.rating}|${z.variant}`)).size;
  const values = zeilen
    .map(
      (z) =>
        `  (${sq(z.category)}, ${sq(z.subcategory)}, ${sq(z.employeeType)}, ${sq(z.rating)}, ${z.variant}, ${sq(z.tempus)},\n   ${sq(z.text)})`,
    )
    .join(",\n");
  const liste = [...new Set(zeilen.map((z) => `--   ${z.category} / ${z.rating} / Variante ${z.variant}`))].join("\n");

  const match = `p.category = n.category and p.subcategory = n.subcategory
   and p.employee_type::text = n.employee_type and p.gender::text = 'd'
   and p.rating::text = n.rating and p.variant = n.variant and p.tempus::text = n.tempus`;

  return `-- ${datei}
-- GENERIERT von scripts/build-bausteine-037.ts aus scripts/data/bausteine-037-uncodiert.json.
-- Nicht von Hand ändern: Texte in der JSON-Datei pflegen und neu erzeugen
-- (npm run bausteine:build).
--
-- Folgemigration zu 037: Korrekturen an den Satzbausteinen, die seit der letzten
-- eingespielten Bausteine-Migration in der JSON-Quelle geändert wurden.
-- Gegenüberstellung alt/neu: docs/bausteine-ungenuegend-review.md.
--
-- Umfang: ${anzahlBausteine} Bausteine, ${zeilen.length} Zeilen (Präsens/Präteritum):
${liste}
--
-- Nur Daten, kein Schema. Bereits erzeugte und versiegelte Zeugnisse bleiben
-- unverändert; die neuen Texte gelten für neu erzeugte Zeugnisse.
--
-- Supabase: von Hand im SQL-Editor (Projekt "zeugnix") ausführen.
-- nine: läuft mit scripts/migrate.mjs automatisch mit.
-- Danach eintragen, damit die Datei eingefroren ist und nicht erneut erzeugt wird:
--   npx tsx scripts/build-bausteine-037.ts --eingespielt ${datei}
--
-- Idempotent: Das UPDATE trifft nur Zeilen, deren Text noch nicht der neue ist.
-- Erster Lauf: ${zeilen.length} Treffer. Jeder weitere Lauf: 0 Treffer.
-- Am Schluss prüft ein DO-Block, dass jede Zeile genau einmal mit dem neuen Text
-- existiert. Fehlt eine, bricht die Migration ab und die Transaktion ändert nichts.

begin;

create temp table ${tmp} (
  category      text not null,
  subcategory   text not null,
  employee_type text not null,
  rating        text not null,
  variant       int  not null,
  tempus        text not null,
  text          text not null
) on commit drop;

insert into ${tmp} (category, subcategory, employee_type, rating, variant, tempus, text) values
${values};

update public.phrase_blocks p
   set text = n.text
  from ${tmp} n
 where ${match}
   and p.text is distinct from n.text;

do $$
declare
  fehlt   int;
  doppelt int;
begin
  select count(*) into fehlt
    from ${tmp} n
   where not exists (
     select 1 from public.phrase_blocks p
      where ${match.replace(/\n/g, "\n      ")}
        and p.text = n.text);
  if fehlt > 0 then
    raise exception '${nummer}: % von ${zeilen.length} Bausteinen nicht gefunden. Abbruch, nichts geändert.', fehlt;
  end if;

  select count(*) into doppelt
    from (select 1
            from ${tmp} n
            join public.phrase_blocks p on ${match.replace(/\n/g, "\n                                       ")}
           group by n.category, n.subcategory, n.employee_type, n.rating, n.variant, n.tempus
          having count(*) > 1) d;
  if doppelt > 0 then
    raise exception '${nummer}: % Bausteine existieren mehrfach. Abbruch, nichts geändert.', doppelt;
  end if;
end $$;

commit;
`;
}

// ---------------------------------------------------------------------------
// Ausgabe 2: Gegenüberstellung für die HR-Prüfung
// ---------------------------------------------------------------------------

/** Lesbare Fassung: weibliche Form, Beispielname. Pipes können so nicht vorkommen. */
export function lesbar(text: string, form: 0 | 1 = 1, vorname = "Lena", nachname = "Muster"): string {
  return text
    .replace(/\{\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}\}/g, (_m, mask, fem) => (form === 0 ? mask : fem))
    .replace(/\{vorname\}/g, vorname)
    .replace(/\{nachname\}/g, nachname);
}

/**
 * Die drei «ungenügend»-Sätze aus Christophs Testzeugnis «Hans Musterli» (21.08.2026),
 * erzeugt mit zeugnio im Präteritum. Erfundene Testperson, keine echten Personendaten.
 */
const MUSTERLI: string[] = [
  "zufriedenheit_leistung|ungenuegend|3",
  "verhalten_gegenueber_dritten|ungenuegend|1",
  "teamfaehigkeit|ungenuegend|1",
];

const STUFE: Record<string, string> = { genuegend: "genügend", ungenuegend: "ungenügend" };

export function renderReview(aenderungen: Aenderung[], seed: SeedRow[]): string {
  const byKey = new Map(aenderungen.map((a) => [a.key, a]));
  const praesens = seed.filter(
    (r) => r.tempus === "praesens" && (r.rating === "genuegend" || r.rating === "ungenuegend"),
  );
  const nG = aenderungen.filter((a) => a.rating === "genuegend").length;
  const nU = aenderungen.filter((a) => a.rating === "ungenuegend").length;
  const totalG = praesens.filter((r) => r.rating === "genuegend").length;
  const totalU = praesens.filter((r) => r.rating === "ungenuegend").length;

  const out: string[] = [];
  out.push(
    "# Satzbausteine «genügend» und «ungenügend»: alt und neu",
    "",
    "> Zur Durchsicht durch Christoph Senn (First Advisory) vor der Freischaltung.",
    "> Generiert aus `scripts/data/bausteine-037-uncodiert.json` (`npx tsx scripts/build-bausteine-037.ts`).",
    "",
    "## Worum es geht",
    "",
    `zeugnio setzt das Zeugnis aus Satzbausteinen zusammen, vier Stufen pro Fähigkeit. Die Bausteine der Stufen «genügend» und «ungenügend» waren bisher oft codiert: Sie klangen freundlich und meinten etwas anderes («bemüht sich», «meist», «im Rahmen seiner Möglichkeiten»). Einige sagten wörtlich «genügend», obwohl sie bei «ungenügend» standen. Unsere eigene Klartext-Analyse hat genau diese Sätze markiert.`,
    "",
    "Die neue Fassung folgt drei Regeln:",
    "",
    "1. **Kein Zeugniscode.** Was gemeint ist, steht im Satz. Ein automatischer Test sperrt rund 40 bekannte Codewörter und Abschwächer.",
    "2. **Brückentechnik.** Eine Schwäche wird ehrlich, aber wohlwollend benannt und mit einer echten Stärke oder einem Entwicklungsschritt verbunden. So bleibt das Zeugnis wahr und wohlwollend, wie es Art. 330a OR verlangt.",
    "3. **Jede Stufe ist als Stufe lesbar.** «genügend» heisst «erfüllt die Anforderungen», ohne Übertreibung und ohne versteckten Abzug. «ungenügend» sagt offen, wo die Anforderungen nicht erfüllt sind.",
    "",
    `**Umfang:** ${nG} von ${totalG} Bausteinen «genügend» und ${nU} von ${totalU} Bausteinen «ungenügend» sind neu. Die übrigen ${totalG - nG} «genügend»-Bausteine waren bereits uncodiert und stehen am Schluss zur Kontrolle.`,
    "",
    "**So liest du die Tabellen:** Gezeigt ist die Präsens-Fassung (Zwischenzeugnis) mit der Beispielperson «Lena Muster». Im System stehen Platzhalter für Name und Geschlecht, und zu jedem Satz gibt es dieselbe Fassung im Präteritum für das Schlusszeugnis.",
    "",
    "**Wichtig für die Auswahl:** Jede Fähigkeit hat mehrere Varianten. Die Stärke in der Brücke muss auf die Person zutreffen. HR wählt die Variante, die stimmt, und passt sie bei Bedarf an. Varianten mit einem Entwicklungsschritt (zum Beispiel «hat sich spürbar verbessert») nur wählen, wenn das zutrifft.",
    "",
    "**Deine Rückmeldung:** Am einfachsten pro Zeile mit der Nummer, zum Beispiel «U-17: zu hart» oder «G-4: ok». Die Texte sind auf zeugnio.ch bereits aktiv, damit du sie direkt im Tool ausprobieren kannst. Wir passen sie nach deiner Rückmeldung an.",
    "",
    "## Grundlage: deine Unterlagen vom 7. Juli",
    "",
    "- **Häusermann, «Uncodierte, transparente Arbeitszeugnisse»:** Brückentechnik (positiv, negativ, positiv) und keine absoluten Negativaussagen. Darum steht bei Schwächen «nicht immer», «wiederholt» oder «häufig» und nicht «war nicht in der Lage».",
    "- **Notenskala_Formulierung:** Alle Codes der Noten 5 und 6 («bemüht», «versucht», «bestrebt», «nach Kräften», «im Wesentlichen», «verständnisvoll», «gab klare Anweisungen» usw.) sperrt der Test. Kein Baustein unter «gut» enthält sie.",
    "- **First-Merkblatt 2017:** wahr, wohlwollend, vollständig, klar. Die ganze Anstellungsdauer zählt, nicht ein einzelner Vorfall. Uncodiert ist Usanz.",
    "",
  );

  // Vorher/Nachher am Testzeugnis «Hans Musterli»
  const seedIdx = new Map(seed.map((r) => [`${keyOf(r)}|${r.tempus}`, r]));
  out.push(
    "## Am Beispiel deines Testzeugnisses «Hans Musterli»",
    "",
    "Dein Testzeugnis vom 21. August enthält drei «ungenügend»-Sätze. So sehen sie neu aus:",
    "",
    "| Alt (im Testzeugnis) | Neu |",
    "|---|---|",
  );
  for (const key of MUSTERLI) {
    const alt = seedIdx.get(`${key}|praeteritum`);
    const neu = byKey.get(key);
    if (!alt || !neu) throw new Error(`Musterli-Beispiel: ${key} fehlt`);
    out.push(`| ${lesbar(alt.text, 0, "Hans", "Musterli")} | ${lesbar(neu.praeteritum, 0, "Hans", "Musterli")} |`);
  }
  out.push(
    "",
    "Im selben Zeugnis steht danach der Schlusssatz «… danken ihm für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen». Neben drei «ungenügend» widerspricht er dem Rest. Der Schlusssatz wird separat gewählt und gehört nicht zu dieser Änderung. Ein Hinweis im Tool bei solchen Widersprüchen wäre ein möglicher nächster Schritt.",
    "",
  );

  let nr = { genuegend: 0, ungenuegend: 0 } as Record<string, number>;
  let theme = "";
  const unveraendert: string[] = [];

  for (const skill of [...SKILLS].sort((a, b) => a.order - b.order)) {
    const rows = praesens
      .filter((r) => r.category === skill.key)
      .sort((a, b) =>
        a.rating === b.rating ? a.variant - b.variant : a.rating === "ungenuegend" ? 1 : -1,
      );
    const geaendert = rows.filter((r) => byKey.has(keyOf(r)));
    for (const r of rows) {
      if (!byKey.has(keyOf(r))) unveraendert.push(`- **${skill.label}**, ${STUFE[r.rating]} ${r.variant}: ${lesbar(r.text)}`);
    }
    if (geaendert.length === 0) continue;

    if (skill.theme !== theme) {
      theme = skill.theme;
      out.push(`## ${skill.themeLabel}${skill.employeeType === "fuehrungskraft" ? " (nur Führungskräfte)" : ""}`, "");
    }
    out.push(`### ${skill.label}`, "", "| Nr. | Stufe | Alt | Neu | Warum besser |", "|---|---|---|---|---|");
    for (const r of geaendert) {
      const a = byKey.get(keyOf(r))!;
      nr[r.rating] += 1;
      const id = `${r.rating === "genuegend" ? "G" : "U"}-${nr[r.rating]}`;
      out.push(`| ${id} | ${STUFE[r.rating]} ${r.variant} | ${lesbar(r.text)} | ${lesbar(a.praesens)} | ${a.warum} |`);
    }
    out.push("");
  }

  out.push(
    "## Anhang: unveränderte Bausteine",
    "",
    "Diese Sätze enthalten keinen Code und bleiben, wie sie sind. Hier nur zur Kontrolle, ob die Stufe stimmt.",
    "",
    ...unveraendert,
    "",
  );
  return out.join("\n");
}
