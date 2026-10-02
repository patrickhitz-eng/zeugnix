// Spielt die SQL-Migrationen aus supabase/ auf die Datenbank ein – einmal, in der
// richtigen Reihenfolge, jede in einer eigenen Transaktion.
//
// Bisher liefen diese Dateien von Hand im Supabase-SQL-Editor. Auf dem eigenen Server
// braucht es einen Läufer, der sich merkt, was schon eingespielt ist: sonst ist die Frage
// "läuft Migration 023 in der Produktion?" nur noch durch Hinsehen in der Datenbank zu
// beantworten, und genau daran ist der bisherige Ablauf schon einmal hängen geblieben.
//
// usage: node --env-file=.env scripts/migrate.mjs [--status] [--dry-run] [--baseline]
//
//   --status     zeigt, was eingespielt ist und was aussteht. Verändert nichts.
//   --dry-run    zeigt, was eingespielt WÜRDE. Verändert nichts.
//   --baseline   markiert alle vorhandenen Migrationen als eingespielt, OHNE sie
//                auszuführen. Beim Umzug auf advisori01 NICHT nötig: dort laufen die
//                Migrationen wirklich, weil das Schema aus diesem Repository kommt und
//                nicht aus einem Auszug der Produktionsdatenbank (die auf PostgreSQL 17
//                läuft, der Server hier auf 16 – ein Auszug ist aufwärtskompatibel, nicht
//                abwärts). Die Option bleibt für den Fall, dass eine Datenbank aus einem
//                Auszug entsteht, in dem das Schema schon enthalten ist.
//
// Dateien ab 900 werden NICHT automatisch eingespielt. Sie richten Rollen, Schemas und
// Eigentumsverhältnisse ein, brauchen dafür mehr Rechte als der Anwendungsbenutzer und
// werden einmalig von Hand ausgeführt (siehe docs/setup-zeugnio-nine.html). --status
// listet sie mit auf, damit sie nicht in Vergessenheit geraten.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_DIR = path.join(process.cwd(), "supabase");
const MANUAL_FROM = 900;

// Migrationen, die auf dem eigenen Server nicht laufen können oder sollen – mit dem
// Grund daneben, damit niemand sie später aus Unkenntnis wieder aufnimmt.
//
// Diese Liste ist der Preis dafür, dass das Repository die Quelle der Wahrheit ist und
// nicht ein Auszug aus der Produktion. Das war nicht immer so: der Plan sah vor, das
// Schema aus der Produktionsdatenbank zu übernehmen und 001–025 nur als „eingespielt" zu
// vermerken. Das trägt nicht mehr, seit klar ist, dass dort PostgreSQL 17 läuft und hier
// 16 – ein Auszug ist aufwärtskompatibel, nicht abwärts. Also laufen die Migrationen hier
// wirklich, und die beiden, die Supabase-Eigenes anfassen, fallen heraus.
const NICHT_AUF_EIGENEM_SERVER = {
  "007_storage_logos.sql":
    "Legt den Supabase-Storage-Bucket an und setzt Regeln auf storage.objects. Dieses " +
    "Schema gibt es hier nicht, die Migration würde scheitern. Kein Verlust: die " +
    "Firmenlogos liegen seit der Umstellung auf der Platte (lib/uploads/logos.ts).",
};

const args = new Set(process.argv.slice(2));
const statusOnly = args.has("--status");
const dryRun = args.has("--dry-run");
const baseline = args.has("--baseline");

for (const arg of args) {
  if (!["--status", "--dry-run", "--baseline"].includes(arg)) {
    console.error(`Unbekannte Option: ${arg}`);
    process.exit(2);
  }
}

function fail(message) {
  console.error(`[migrate] Fehler: ${message}`);
  process.exit(1);
}

// --- Verbindung -------------------------------------------------------------------------
let url;
try {
  url = new URL(process.env.DATABASE_URL ?? "");
} catch {
  fail("DATABASE_URL fehlt oder ist ungültig.");
}
if (!["postgresql:", "postgres:"].includes(url.protocol)) {
  fail(`DATABASE_URL beginnt mit "${url.protocol}" – erwartet wird postgresql://.`);
}

// Das Passwort geht über die Umgebung des Kindprozesses, nie über die Befehlszeile: dort
// wäre es für jeden anderen Benutzer des Servers in der Prozessliste sichtbar.
const childEnv = {
  ...process.env,
  PGHOST: url.hostname || "127.0.0.1",
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGCONNECT_TIMEOUT: "10",
  // Deutsche Fehlermeldungen von psql wären hier eine Fehlerquelle beim Weitergeben.
  LC_MESSAGES: "C",
};

/** Führt psql aus. `sql` kommt über die Standardeingabe, damit nichts in der Prozessliste
 *  landet. Gibt { ok, stdout, stderr } zurück. */
function psql(sql, extraArgs = []) {
  const result = spawnSync("psql", ["-w", "-X", "-q", "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    input: sql,
    env: childEnv,
    encoding: "utf8",
  });
  if (result.error) {
    fail(`psql nicht startbar (${result.error.message}). Ist postgresql-client installiert?`);
  }
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// --- Migrationsdateien ------------------------------------------------------------------
let entries;
try {
  entries = readdirSync(MIGRATION_DIR);
} catch {
  fail(`${MIGRATION_DIR} nicht lesbar. Das Skript gehört in das Wurzelverzeichnis der App.`);
}

// Nur nummerierte Dateien. Die mit Unterstrich beginnenden sind Notizen und Prüfabfragen
// (_PROD_ausstehend_…, _check_…) und dürfen nie automatisch laufen.
const all = entries
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

const auto = all.filter(
  (name) => Number(name.slice(0, 3)) < MANUAL_FROM && !(name in NICHT_AUF_EIGENEM_SERVER),
);
const manual = all.filter((name) => Number(name.slice(0, 3)) >= MANUAL_FROM);
const ausgenommen = all.filter((name) => name in NICHT_AUF_EIGENEM_SERVER);

// Ein Tippfehler in der Ausnahmeliste würde sonst stillschweigend dazu führen, dass eine
// Migration doch läuft, die nicht laufen darf.
for (const name of Object.keys(NICHT_AUF_EIGENEM_SERVER)) {
  if (!all.includes(name)) {
    fail(
      `Die Ausnahmeliste nennt ${name}, aber diese Datei gibt es in ${MIGRATION_DIR} nicht. ` +
        "Umbenannt oder Tippfehler? Beides muss geklärt werden, bevor migriert wird.",
    );
  }
}

if (auto.length === 0) fail("Keine Migrationsdateien gefunden.");

function checksum(name) {
  return createHash("sha256").update(readFileSync(path.join(MIGRATION_DIR, name))).digest("hex");
}

// --- Buchführung ------------------------------------------------------------------------
// Die Tabelle gehört bewusst nicht ins Schema public der Anwendung, sondern trägt einen
// eigenen Namen: sie wird von PostgREST nicht ausgeliefert (keine Grants) und steht damit
// auch nicht in der Daten-API.
const ensureTable = `
create table if not exists public.schema_migrations (
  filename   text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now()
);
revoke all on public.schema_migrations from public;
`;

const setup = psql(ensureTable);
if (!setup.ok) {
  fail(
    "Die Tabelle schema_migrations liess sich nicht anlegen.\n" +
      setup.stderr.trim() +
      "\nHäufigste Ursache: der Benutzer darf im Schema public nichts anlegen.",
  );
}

const listed = psql("select filename || ' ' || checksum from public.schema_migrations;", ["-A", "-t"]);
if (!listed.ok) fail(`schema_migrations nicht lesbar.\n${listed.stderr.trim()}`);

const applied = new Map();
for (const line of listed.stdout.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const [name, sum] = trimmed.split(" ");
  applied.set(name, sum);
}

// --- Geänderte, bereits eingespielte Migrationen ----------------------------------------
// Eine nachträglich bearbeitete Migration ist der Fehler, der sich am längsten versteckt:
// die Datenbank hat die alte Fassung, das Repository zeigt die neue, und beim nächsten
// frischen Aufbau sieht das Schema anders aus als in der Produktion.
const changed = auto.filter((name) => applied.has(name) && applied.get(name) !== checksum(name));
if (changed.length > 0 && !baseline) {
  console.error("[migrate] Diese bereits eingespielten Migrationen wurden nachträglich verändert:");
  for (const name of changed) console.error(`  ${name}`);
  fail(
    "Eine eingespielte Migration wird nicht rückwirkend bearbeitet. Stattdessen eine neue " +
      "Datei mit der nächsten Nummer anlegen. Ist die Änderung reine Kosmetik (Kommentar, " +
      "Formatierung), einmal mit --baseline laufen lassen, um die Prüfsumme nachzuziehen.",
  );
}

const pending = auto.filter((name) => !applied.has(name));

// --- Anzeigen ---------------------------------------------------------------------------
if (statusOnly || dryRun) {
  console.log(`Datenbank: ${childEnv.PGDATABASE} auf ${childEnv.PGHOST}:${childEnv.PGPORT}`);
  console.log(`\nEingespielt (${applied.size}):`);
  for (const name of auto.filter((n) => applied.has(n))) console.log(`  ${name}`);
  console.log(`\nOffen (${pending.length}):`);
  for (const name of pending) console.log(`  ${name}`);
  if (manual.length > 0) {
    console.log(`\nVon Hand einzuspielen, nicht Teil dieses Läufers (${manual.length}):`);
    for (const name of manual) {
      console.log(`  ${name}${applied.has(name) ? "  (als eingespielt vermerkt)" : ""}`);
    }
  }
  if (ausgenommen.length > 0) {
    console.log(`\nAuf diesem Server ausgenommen (${ausgenommen.length}):`);
    for (const name of ausgenommen) {
      console.log(`  ${name}\n    ${NICHT_AUF_EIGENEM_SERVER[name]}`);
    }
  }
  process.exit(0);
}

// --- Baseline ---------------------------------------------------------------------------
if (baseline) {
  const rows = auto
    .map((name) => `('${name}', '${checksum(name)}')`)
    .join(",\n    ");
  const sql = `
begin;
insert into public.schema_migrations (filename, checksum) values
    ${rows}
on conflict (filename) do update set checksum = excluded.checksum, applied_at = now();
commit;
`;
  const result = psql(sql);
  if (!result.ok) fail(`Baseline fehlgeschlagen.\n${result.stderr.trim()}`);
  console.log(`[migrate] ${auto.length} Migrationen als eingespielt vermerkt (nichts ausgeführt).`);
  if (manual.length > 0) {
    console.log(`[migrate] Weiterhin von Hand einzuspielen: ${manual.join(", ")}`);
  }
  process.exit(0);
}

// --- Einspielen -------------------------------------------------------------------------
if (pending.length === 0) {
  console.log("[migrate] Nichts zu tun, alle Migrationen sind eingespielt.");
  process.exit(0);
}

console.log(`[migrate] ${pending.length} Migration(en) einzuspielen:`);
for (const name of pending) console.log(`  ${name}`);

for (const name of pending) {
  const file = path.join(MIGRATION_DIR, name);
  // Datei und Vermerk in EINER Transaktion: bricht die Migration ab, gilt sie auch nicht
  // als eingespielt. Der umgekehrte Fall – ausgeführt, aber nicht vermerkt – wäre beim
  // nächsten Lauf ein Fehlschlag mitten in der Kette.
  // `set local`: gilt nur bis zum commit, hinterlässt also nichts in der Sitzung.
  //
  // Warum überhaupt: die Migrationen rufen 13 Mal `uuid_generate_v4()` ohne Schema auf.
  // Bei Supabase liegt uuid-ossp in `extensions`, nicht in `public` – der Name löst dort
  // nur auf, weil `extensions` im search_path steht. Auf dem eigenen Server setzt
  // 900_nine_bootstrap.sql dafür den search_path der Datenbank, aber nur, wenn der
  // ausführende Benutzer deren Eigentümer ist; andernfalls gibt es bloss einen Hinweis.
  // Diese Zeile macht den Lauf davon unabhängig. Fehlte sie und wäre der search_path
  // nicht gesetzt, bräche schon 001 ab mit „function uuid_generate_v4() does not exist".
  //
  // Nur für das Anlegen nötig, nicht im Betrieb: PostgreSQL merkt sich den Vorgabewert
  // einer Spalte als aufgelösten Ausdruck mit der Objektkennung der Funktion. Beim
  // späteren INSERT wird der Name nicht erneut gesucht.
  const sql = `
begin;
set local search_path to public, extensions;
\\i ${file}
insert into public.schema_migrations (filename, checksum) values ('${name}', '${checksum(name)}');
commit;
`;
  process.stdout.write(`[migrate] ${name} … `);
  const result = psql(sql);
  if (!result.ok) {
    process.stdout.write("fehlgeschlagen\n");
    console.error(result.stderr.trim());
    fail(`${name} wurde nicht eingespielt. Die Datenbank ist unverändert (Transaktion zurückgerollt).`);
  }
  process.stdout.write("ok\n");
}

console.log(`[migrate] ${pending.length} Migration(en) eingespielt.`);
console.log(
  "[migrate] Hinweis: PostgREST hält das Schema im Zwischenspeicher. Nach einer Änderung\n" +
    "          an Tabellen oder Funktionen einmal:  systemctl --user reload postgrest",
);
