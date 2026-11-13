/**
 * Gemeinsame Logik für Migration 037 (uncodierte Bausteine «genügend»/«ungenügend»).
 *
 * Eine Quelle, zwei Ausgaben:
 *   scripts/data/bausteine-037-uncodiert.json   ← hier werden die Texte gepflegt
 *     ├─ supabase/037_bausteine_ungenuegend.sql  (Migration, generiert)
 *     └─ docs/bausteine-ungenuegend-review.md    (Gegenüberstellung für die HR-Prüfung, generiert)
 *
 * Erzeugen:  npx tsx scripts/build-bausteine-037.ts
 * Prüfen:    npm run test:bausteine
 *
 * Der alte Text kommt aus supabase/009_seed_bausteine.sql. Der Seed enthält bereits
 * die Korrekturen aus 014 und 028 (siehe deren Kopf), entspricht also dem Stand,
 * der heute in der Produktion läuft.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { SKILLS } from "../lib/phrases/skills";

export const ROOT = path.join(__dirname, "..");
export const SEED_PATH = path.join(ROOT, "supabase", "009_seed_bausteine.sql");
export const DATA_PATH = path.join(ROOT, "scripts", "data", "bausteine-037-uncodiert.json");
export const SQL_PATH = path.join(ROOT, "supabase", "037_bausteine_ungenuegend.sql");
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
// Ausgabe 1: Migration
// ---------------------------------------------------------------------------

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

interface Zeile {
  a: Aenderung;
  tempus: Tempus;
  alt: SeedRow;
  neu: string;
}

function zeilen(aenderungen: Aenderung[], seed: SeedRow[]): Zeile[] {
  const index = new Map(seed.map((r) => [`${keyOf(r)}|${r.tempus}`, r]));
  const out: Zeile[] = [];
  for (const a of aenderungen) {
    for (const tempus of ["praesens", "praeteritum"] as const) {
      const alt = index.get(`${a.key}|${tempus}`);
      if (!alt) throw new Error(`${a.key} (${tempus}) fehlt in 009_seed_bausteine.sql`);
      out.push({ a, tempus, alt, neu: a[tempus] });
    }
  }
  return out;
}

export function renderSql(aenderungen: Aenderung[], seed: SeedRow[]): string {
  const z = zeilen(aenderungen, seed);
  const nG = aenderungen.filter((a) => a.rating === "genuegend").length;
  const nU = aenderungen.filter((a) => a.rating === "ungenuegend").length;

  const values = z
    .map(
      ({ alt, tempus, neu }) =>
        `  (${sq(alt.category)}, ${sq(alt.subcategory)}, ${sq(alt.employeeType)}, ${sq(alt.rating)}, ${alt.variant}, ${sq(tempus)},\n   ${sq(neu)})`,
    )
    .join(",\n");

  const match = `p.category = n.category and p.subcategory = n.subcategory
   and p.employee_type::text = n.employee_type and p.gender::text = 'd'
   and p.rating::text = n.rating and p.variant = n.variant and p.tempus::text = n.tempus`;

  return `-- 037_bausteine_ungenuegend.sql
-- GENERIERT von scripts/build-bausteine-037.ts aus scripts/data/bausteine-037-uncodiert.json.
-- Nicht von Hand ändern: Texte in der JSON-Datei pflegen und neu erzeugen.
--
-- Uncodierte Satzbausteine für «genügend» und «ungenügend» (Marktstart Schritt 19,
-- Must-have E für den Outreach ab 1.12.2026). Die bisherigen Texte waren teils
-- Zeugniscode («bemüht», «meist», «im Rahmen seiner Möglichkeiten» …) oder sagten
-- wörtlich «genügend», obwohl sie bei «ungenügend» standen. Neu wird eine Schwäche
-- offen benannt und mit einer echten Stärke oder einem Entwicklungsschritt verbunden
-- (Brückentechnik). Gegenüberstellung alt/neu: docs/bausteine-ungenuegend-review.md.
--
-- Umfang: ${aenderungen.length} Bausteine (${nG} «genügend», ${nU} «ungenügend»), je Präsens
-- und Präteritum, also ${z.length} Zeilen. Nicht aufgeführte Bausteine bleiben unverändert.
-- Kategorien, Varianten und Platzhalter bleiben gleich, die Engine braucht keine Änderung.
--
-- Nur Daten, kein Schema: Die Migration berührt den Schemastopp vor dem Umzug nicht.
-- Bereits erzeugte Zeugnisse (certificates.generated_text, versiegelte Texte) bleiben
-- unverändert; die neuen Texte gelten für neu erzeugte Zeugnisse.
--
-- Supabase: von Hand im SQL-Editor (Projekt "zeugnix") ausführen.
-- nine: läuft mit scripts/migrate.mjs nach 009 automatisch mit.
--
-- Idempotent: Das UPDATE trifft nur Zeilen, deren Text noch nicht der neue ist.
-- Erster Lauf: ${z.length} Treffer. Jeder weitere Lauf: 0 Treffer.
-- Am Schluss prüft ein DO-Block, dass jede Zeile genau einmal mit dem neuen Text
-- existiert. Fehlt eine, bricht die Migration ab und die Transaktion ändert nichts.

begin;

create temp table _bausteine_037 (
  category      text not null,
  subcategory   text not null,
  employee_type text not null,
  rating        text not null,
  variant       int  not null,
  tempus        text not null,
  text          text not null
) on commit drop;

insert into _bausteine_037 (category, subcategory, employee_type, rating, variant, tempus, text) values
${values};

update public.phrase_blocks p
   set text = n.text
  from _bausteine_037 n
 where ${match}
   and p.text is distinct from n.text;

do $$
declare
  fehlt   int;
  doppelt int;
begin
  select count(*) into fehlt
    from _bausteine_037 n
   where not exists (
     select 1 from public.phrase_blocks p
      where ${match.replace(/\n/g, "\n      ")}
        and p.text = n.text);
  if fehlt > 0 then
    raise exception '037: % von ${z.length} Bausteinen nicht gefunden. Abbruch, nichts geändert.', fehlt;
  end if;

  select count(*) into doppelt
    from (select 1
            from _bausteine_037 n
            join public.phrase_blocks p on ${match.replace(/\n/g, "\n                                       ")}
           group by n.category, n.subcategory, n.employee_type, n.rating, n.variant, n.tempus
          having count(*) > 1) d;
  if doppelt > 0 then
    raise exception '037: % Bausteine existieren mehrfach. Abbruch, nichts geändert.', doppelt;
  end if;
end $$;

commit;
`;
}

// ---------------------------------------------------------------------------
// Ausgabe 2: Gegenüberstellung für die HR-Prüfung
// ---------------------------------------------------------------------------

/** Lesbare Fassung: weibliche Form, Beispielname. Pipes können so nicht vorkommen. */
export function lesbar(text: string): string {
  return text
    .replace(/\{\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}\}/g, (_m, _mask, fem) => fem)
    .replace(/\{vorname\}/g, "Lena")
    .replace(/\{nachname\}/g, "Muster");
}

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
    "**Deine Rückmeldung:** Am einfachsten pro Zeile mit der Nummer, zum Beispiel «U-17: zu hart» oder «G-4: ok». Wir passen die Texte an und schalten sie erst nach deinem Okay frei.",
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
