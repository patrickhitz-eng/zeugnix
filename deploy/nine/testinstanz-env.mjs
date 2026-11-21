#!/usr/bin/env node
// Schreibt die .env der Testinstanz (~/zeugnio-test/shared/.env) aus der .env der Produktion.
// Aufgerufen von deploy/nine/testinstanz.sh (Unterbefehl env), nicht von Hand.
//
// Gibt NIE einen Wert aus, nur Namen und Herkunft. Die .env der Produktion wird nur gelesen.
//
// Nach einer Liste, nicht nach Gefuehl: Aus der Produktion kommen nur die Werte, die die
// Testinstanz wirklich braucht und die nichts Echtes ausloesen koennen. Alles andere wird neu
// erzeugt oder weggelassen. Ein neuer Schluessel in der Produktion landet so nie aus Versehen in
// der Testinstanz.
//
//   uebernommen   RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO
//                 Die Anmelde-Mails sollen wirklich ankommen. Dafuer gibt es keinen Testweg.
//   fuer den Test NEXT_PUBLIC_SITE_URL (https://test.zeugnio.ch), ZEUGNIO_AUTH=eigen,
//                 DATABASE_URL (Wegwerf-Cluster), DATA_API_URL (127.0.0.1:3014),
//                 ZEUGNIO_UPLOAD_DIR (Kopie der Logos)
//   neu erzeugt   ZEUGNIO_AUTH_SECRET, DATA_API_JWT_SECRET, CRON_SECRET,
//                 ZEUGNIO_SIGNING_PRIVATE_KEY (eigener Test-Signaturschluessel)
//   Attrappe      NEXT_PUBLIC_SUPABASE_URL=https://supabase.invalid und zwei Schluessel, die
//                 nirgends gelten (ZEUGNIO_OWN_AUTH=1 schaltet die Supabase-Pruefung in
//                 check-env ab). Grund: Mit dem echten Service-Schluessel loeschte «Konto
//                 loeschen» im Schalter supabase das ECHTE Supabase-Konto der Person
//                 (app/api/account/delete), und die Produktion meldet bis Tag B ueber Supabase an.
//                 .invalid ist fuer Namen reserviert, die nie aufgeloest werden (RFC 2606): Ruft
//                 die App im Schalter eigen doch noch Supabase auf, scheitert das laut im Log.
//   nur oeffentlich ZEUGNIO_SIGNING_PUBLIC_KEYS: die oeffentlichen Schluessel der Produktion,
//                 damit kopierte, echt signierte Zeugnisse auch auf der Testadresse pruefbar
//                 bleiben. Umgekehrt kennt die Produktion den Testschluessel nicht: Ein auf der
//                 Testinstanz signiertes Zeugnis geht auf zeugnio.ch nie als echt durch.
//   weggelassen   alles andere, u. a. STRIPE_*, S3_* und die Supabase-Werte der Produktion
//
// Umgebung (setzt testinstanz.sh):
//   TESTINSTANZ_PROD_ENV       .env der Produktion (nur lesen)
//   TESTINSTANZ_DIR            Ordner der Testinstanz (~/zeugnio-test)
//   TESTINSTANZ_ENV            Ziel, muss in TESTINSTANZ_DIR liegen
//   TESTINSTANZ_PG_SOCKET      Socket-Ordner des Wegwerf-Clusters (in TESTINSTANZ_DIR)
//   TESTINSTANZ_PG_PORT        dessen Port (nicht 5432)
//   TESTINSTANZ_DB             Name der Testdatenbank
//   TESTINSTANZ_DB_USER        Anmeldebenutzer der App (wie in der Produktion nmd_zeugnio)
//   TESTINSTANZ_API_PORT       Port der Test-Daten-API
//   TESTINSTANZ_SITE_URL       oeffentliche Adresse der Testinstanz
//   TESTINSTANZ_UPLOAD_DIR     Ordner fuer die Kopie der Logos
//   TESTINSTANZ_NEU=1          eine bestehende Test-.env ersetzen
//
// DATABASE_URL zeigt ueber den Parameter host= auf den Socket (so liest es libpq und seit
// dieser Aenderung auch scripts/migrate.mjs). Der Host «localhost» davor ist nur fuer
// check-env da, das eine Adresse mit Host und Passwort verlangt. Das Passwort ist ein
// Zufallswert ohne Bedeutung: Der Cluster laesst ueber seinen Socket ohne Passwort herein
// (trust), und an den Socket kommt nur der Benutzer www-zeugnio (Ordner mit Rechten 700).
// Auf Port 5444 lauscht per TCP nichts. Liest ein Werkzeug den Parameter host= nicht, scheitert
// es darum laut, statt die Produktion auf 5432 zu erreichen.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const fail = (msg) => {
  console.error(`Fehler: ${msg}`);
  process.exit(1);
};

const need = (name) => {
  const value = process.env[name] ?? "";
  if (value === "") fail(`${name} fehlt (wird von testinstanz.sh gesetzt).`);
  return value;
};

const prodEnvFile = need("TESTINSTANZ_PROD_ENV");
const testDir = path.resolve(need("TESTINSTANZ_DIR"));
const outFile = path.resolve(need("TESTINSTANZ_ENV"));
const pgSocket = path.resolve(need("TESTINSTANZ_PG_SOCKET"));
const pgPort = need("TESTINSTANZ_PG_PORT");
const dbName = need("TESTINSTANZ_DB");
const dbUser = need("TESTINSTANZ_DB_USER");
const apiPort = need("TESTINSTANZ_API_PORT");
const siteUrl = need("TESTINSTANZ_SITE_URL");
const uploadDir = path.resolve(need("TESTINSTANZ_UPLOAD_DIR"));
const replace = process.env.TESTINSTANZ_NEU === "1";

// --- Schutz der Produktion --------------------------------------------------------------
if (!existsSync(prodEnvFile)) fail(`${prodEnvFile} fehlt.`);
const prodSharedDir = realpathSync(path.dirname(prodEnvFile));
const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};
if (!inside(outFile, testDir)) fail(`Ziel ${outFile} liegt nicht in ${testDir}.`);
if (!inside(uploadDir, testDir)) fail(`Logo-Ordner ${uploadDir} liegt nicht in ${testDir}.`);
for (const p of [testDir, outFile, uploadDir]) {
  if (p === prodSharedDir || inside(p, prodSharedDir) || inside(prodSharedDir, p)) {
    fail(`${p} beruehrt den Ordner der Produktion (${prodSharedDir}). Abbruch.`);
  }
}
if (existsSync(outFile) && !replace) {
  fail(`${outFile} gibt es schon. Ersetzen nur mit: testinstanz.sh env --neu`);
}

let prod;
try {
  prod = parseEnv(readFileSync(prodEnvFile, "utf8"));
} catch (error) {
  fail(`${prodEnvFile} nicht lesbar (${error.message}).`);
}
const prodValue = (key) => (typeof prod[key] === "string" ? prod[key].trim() : "");

// --- Plausibilitaet der Testwerte -------------------------------------------------------
const isPort = (p) => /^[0-9]+$/.test(p) && Number(p) >= 1024 && Number(p) <= 65535;
if (!inside(pgSocket, testDir)) fail(`Socket-Ordner ${pgSocket} liegt nicht in ${testDir}.`);
if (!isPort(pgPort) || pgPort === "5432") fail("TESTINSTANZ_PG_PORT braucht einen eigenen Port, nicht 5432 (Produktion).");
if (!isPort(apiPort)) fail("TESTINSTANZ_API_PORT ist keine Portnummer.");
if (!/^[a-z_][a-z0-9_]*$/.test(dbName) || !/^[a-z_][a-z0-9_]*$/.test(dbUser)) fail("Datenbank- oder Benutzername ungueltig.");
const prodApi = prodValue("DATA_API_URL");
if (prodApi !== "") {
  let prodApiPort = "";
  try {
    prodApiPort = new URL(prodApi).port;
  } catch {
    // ungueltig in der Produktion: dann gibt es auch keinen Konflikt
  }
  if (prodApiPort === apiPort) fail("TESTINSTANZ_API_PORT ist derselbe Port wie die Daten-API der Produktion.");
}
const databaseUrl =
  `postgresql://${dbUser}:${randomBytes(18).toString("hex")}@localhost:${pgPort}/${dbName}` +
  `?host=${encodeURIComponent(pgSocket)}`;
const dataApiUrl = `http://127.0.0.1:${apiPort}`;
const dbUrl = new URL(databaseUrl);
if (dbUrl.searchParams.get("host") !== pgSocket || dbUrl.port !== pgPort) fail("DATABASE_URL laesst sich nicht sauber bilden.");

// --- Werte zusammenstellen --------------------------------------------------------------
const b64 = (bytes) => randomBytes(bytes).toString("base64");
const hex = (bytes) => randomBytes(bytes).toString("hex");
const keyIdOf = (publicKey) =>
  createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
const pemOf = (raw) => {
  const t = raw.trim();
  if (t.includes("-----BEGIN")) return t;
  return Buffer.from(t, "base64").toString("utf8").trim();
};

/** [Schluessel, Wert, Herkunft] in der Reihenfolge, in der sie in die Datei kommen. */
const entries = [];
const set = (key, value, herkunft) => entries.push([key, value, herkunft]);

set("NEXT_PUBLIC_SITE_URL", siteUrl, "fuer den Test");
set("ZEUGNIO_AUTH", "eigen", "fuer den Test");
set("ZEUGNIO_AUTH_SECRET", b64(48), "neu erzeugt");
set("DATABASE_URL", databaseUrl, "fuer den Test (Wegwerf-Cluster, Passwort ist Fuellwert)");
set("DATA_API_URL", dataApiUrl, "fuer den Test");
set("DATA_API_JWT_SECRET", b64(48), "neu erzeugt (gleich in postgrest.conf der Testinstanz)");
set("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.invalid", "Attrappe (nie aufloesbar)");
set("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_testinstanz_${hex(16)}`, "Attrappe");
set("SUPABASE_SERVICE_ROLE_KEY", `sb_secret_testinstanz_${hex(16)}`, "Attrappe");
set("ZEUGNIO_OWN_AUTH", "1", "fuer den Test (check-env ohne Supabase-Adresse)");

const { privateKey: testPriv, publicKey: testPub } = generateKeyPairSync("ed25519");
const testKeyId = keyIdOf(testPub);
set(
  "ZEUGNIO_SIGNING_PRIVATE_KEY",
  Buffer.from(testPriv.export({ type: "pkcs8", format: "pem" })).toString("base64"),
  `neu erzeugt (Test-Signaturschluessel, Key-ID ${testKeyId})`,
);

// Oeffentliche Schluessel der Produktion: die zurueckgezogenen unveraendert, dazu der aktive,
// abgeleitet aus dem privaten. Der private Schluessel der Produktion bleibt in diesem Prozess
// und wird nirgends hingeschrieben.
const publicKeys = {};
const prodKeyIds = new Set();
const retiredRaw = prodValue("ZEUGNIO_SIGNING_PUBLIC_KEYS");
if (retiredRaw !== "") {
  try {
    const parsed = JSON.parse(retiredRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [label, pem] of Object.entries(parsed)) {
        if (typeof pem !== "string" || pem.includes("PRIVATE KEY")) continue;
        try {
          prodKeyIds.add(keyIdOf(createPublicKey(pemOf(pem))));
          publicKeys[label] = pem;
        } catch {
          // ungueltiger Eintrag: weglassen wie die App selbst
        }
      }
    }
  } catch {
    console.warn("  Hinweis: ZEUGNIO_SIGNING_PUBLIC_KEYS der Produktion ist kein JSON - nicht uebernommen.");
  }
}
const prodPrivRaw = prodValue("ZEUGNIO_SIGNING_PRIVATE_KEY");
if (prodPrivRaw !== "") {
  try {
    const prodPub = createPublicKey(createPrivateKey(pemOf(prodPrivRaw)));
    const kid = keyIdOf(prodPub);
    prodKeyIds.add(kid);
    publicKeys[`produktion-${kid}`] = Buffer.from(prodPub.export({ type: "spki", format: "pem" })).toString("base64");
  } catch {
    console.warn("  Hinweis: Signaturschluessel der Produktion nicht lesbar - sein oeffentlicher Teil fehlt in der Testinstanz.");
  }
}
if (prodKeyIds.has(testKeyId)) fail("Der Test-Signaturschluessel hat dieselbe Key-ID wie ein Produktionsschluessel. Nochmals ausfuehren.");
if (Object.keys(publicKeys).length > 0) {
  set(
    "ZEUGNIO_SIGNING_PUBLIC_KEYS",
    JSON.stringify(publicKeys),
    `nur oeffentlich: ${Object.keys(publicKeys).length} Schluessel der Produktion zum Pruefen`,
  );
}

set("ZEUGNIO_UPLOAD_DIR", uploadDir, "fuer den Test (Kopie der Logos)");

for (const key of ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO"]) {
  const value = prodValue(key);
  if (value === "") {
    if (key === "RESEND_API_KEY") fail("RESEND_API_KEY fehlt in der Produktion. Ohne ihn kommen keine Anmelde-Mails an.");
    console.warn(`  Hinweis: ${key} ist in der Produktion leer - in der Testinstanz ebenfalls.`);
    continue;
  }
  set(key, value, "aus der Produktion uebernommen");
}

set("CRON_SECRET", b64(32), "neu erzeugt (kein Cron fuer die Testinstanz)");

// --- Gegenproben: nichts Geheimes der Produktion ausser dem Mailschluessel -------------
const kept = new Set(["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO", "ZEUGNIO_SIGNING_PUBLIC_KEYS"]);
for (const [key, value] of entries) {
  if (kept.has(key)) continue;
  if (prodValue(key) !== "" && prodValue(key) === value) {
    fail(`${key} waere gleich wie in der Produktion. Abbruch, nichts geschrieben.`);
  }
}
const secrets = entries.filter(([k]) => /SECRET|PRIVATE_KEY|_KEY$/.test(k) && !kept.has(k)).map(([, v]) => v);
if (new Set(secrets).size !== secrets.length) fail("Zwei erzeugte Geheimnisse sind gleich. Nochmals ausfuehren.");

// --- Logos kopieren ---------------------------------------------------------------------
const prodUploads = prodValue("ZEUGNIO_UPLOAD_DIR") || path.join(prodSharedDir, "uploads");
const countFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length
    : 0;
let logoInfo;
if (countFiles(uploadDir) > 0) {
  logoInfo = `schon vorhanden (${countFiles(uploadDir)} Dateien), nicht erneut kopiert`;
} else if (existsSync(prodUploads)) {
  mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  cpSync(prodUploads, uploadDir, { recursive: true, preserveTimestamps: true, force: false, errorOnExist: false });
  logoInfo = `${countFiles(uploadDir)} Dateien kopiert aus ${prodUploads}`;
} else {
  mkdirSync(path.join(uploadDir, "logos"), { recursive: true, mode: 0o700 });
  logoInfo = `Produktion hat keinen Ordner ${prodUploads} - leerer Ordner angelegt`;
}

// --- Schreiben --------------------------------------------------------------------------
function quote(key, value) {
  if (/[\r\n]/.test(value)) fail(`${key} enthaelt einen Zeilenumbruch.`);
  if (value.includes("$")) fail(`${key} enthaelt ein $ - Next.js wuerde es als Variable deuten.`);
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  fail(`${key} enthaelt beide Arten Anfuehrungszeichen.`);
}

const lines = [
  "# zeugnio TESTINSTANZ - erzeugt von deploy/nine/testinstanz-env.mjs",
  `# am ${new Date().toISOString()}. Nicht von Hand pflegen, sondern neu erzeugen (testinstanz.sh env --neu).`,
  "# Aus der Produktion stammen nur RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO und oeffentliche",
  "# Signaturschluessel. Wird mit testinstanz.sh abbau geloescht.",
  "",
  ...entries.map(([key, value]) => `${key}=${quote(key, value)}`),
  "",
];

mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
writeFileSync(`${outFile}.neu`, lines.join("\n"), { mode: 0o600 });
renameSync(`${outFile}.neu`, outFile);

// --- Bericht (nur Namen) ----------------------------------------------------------------
console.log(`.env der Testinstanz geschrieben: ${outFile} (Rechte 600)`);
const width = Math.max(...entries.map(([k]) => k.length));
for (const [key, , herkunft] of entries) console.log(`  ${key.padEnd(width)}  ${herkunft}`);
const omitted = Object.keys(prod).filter((k) => !entries.some(([e]) => e === k)).sort();
if (omitted.length > 0) console.log(`  weggelassen aus der Produktion: ${omitted.join(", ")}`);
console.log(`Logos: ${logoInfo}`);
