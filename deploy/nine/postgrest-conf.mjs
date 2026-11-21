#!/usr/bin/env node
// Schreibt ~/zeugnio/shared/postgrest.conf aus deploy/nine/postgrest.conf.example.
//
// Warum ein Skript und nicht nano: In die Datei gehoeren zwei Geheimnisse, das Passwort von
// authenticator und das JWT-Geheimnis. Von Hand eingefuegt stehen sie auf dem Bildschirm und
// oft in der Zwischenablage, und ein Tippfehler faellt erst auf, wenn jede Anfrage mit 401
// zurueckkommt. Dieses Skript setzt beide ein, ohne sie anzuzeigen.
//
// Das JWT-Geheimnis muss in postgrest.conf und in der .env (DATA_API_JWT_SECRET) GLEICH sein:
// Die Anwendung signiert damit ihre Token, PostgREST prueft sie damit. Steht in der .env schon
// ein Wert, wird er uebernommen. Fehlt er, erzeugt das Skript einen und traegt ihn in beide
// Dateien ein.
//
// Aufruf als www-zeugnio im Checkout (~/zeugnio-setup):
//   read -rsp "Passwort authenticator: " AUTHENTICATOR_PW; echo; export AUTHENTICATOR_PW
//   node deploy/nine/postgrest-conf.mjs; unset AUTHENTICATOR_PW
//
// Das Passwort kommt ueber die Umgebung, nicht als Argument: Argumente stehen in der
// Prozessliste und sind dort fuer jedes andere Konto auf dem Server lesbar.
//
// Eine bestehende postgrest.conf wird nur mit --force ersetzt.
//
// Fuer eine zweite Instanz (Testinstanz, deploy/nine/cutover-b-testinstanz.md) steuern vier
// Umgebungsvariablen das Ergebnis; die letzten drei sind neu. Ohne sie entsteht genau die Datei
// wie bisher:
//   ZEUGNIO_SHARED_DIR      Ordner mit .env und postgrest.conf (Default ~/zeugnio/shared)
//   POSTGREST_DB_URI        ganze Verbindungsadresse statt authenticator@127.0.0.1:5432, z. B. ein
//                           Socket: postgresql:///zeugnio_test?host=%2F…%2Frun&port=5444&user=authenticator
//                           Dann braucht es kein AUTHENTICATOR_PW.
//   POSTGREST_SERVER_PORT   Port der Daten-API (Default aus der Vorlage: 3011)
//   POSTGREST_ADMIN_PORT    Port fuer /live und /ready (Default aus der Vorlage: 3012)
// Steht in der .env eine DATA_API_URL, muss ihr Port zur Daten-API passen, sonst bricht das
// Skript ab: Die App fragte sonst eine andere PostgREST-Instanz als die hier konfigurierte.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fail = (msg) => {
  console.error(`Fehler: ${msg}`);
  process.exit(1);
};

const shared = process.env.ZEUGNIO_SHARED_DIR ?? path.join(homedir(), "zeugnio", "shared");
const envFile = path.join(shared, ".env");
const outFile = path.join(shared, "postgrest.conf");
const template = path.join(path.dirname(fileURLToPath(import.meta.url)), "postgrest.conf.example");
const force = process.argv.includes("--force");

const dbUri = process.env.POSTGREST_DB_URI ?? "";
const pw = process.env.AUTHENTICATOR_PW ?? "";
if (dbUri !== "") {
  if (!/^postgres(ql)?:\/\//.test(dbUri)) fail("POSTGREST_DB_URI muss mit postgresql:// beginnen.");
  if (/["\n$]/.test(dbUri)) fail("POSTGREST_DB_URI enthaelt \", $ oder einen Zeilenumbruch.");
} else if (pw.length < 16) {
  fail("AUTHENTICATOR_PW fehlt oder ist kuerzer als 16 Zeichen. Aufruf siehe Kopf dieser Datei.");
}

/** Port aus der Umgebung oder null (dann gilt die Vorlage). */
function portFromEnv(name) {
  const raw = process.env[name] ?? "";
  if (raw === "") return null;
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
    fail(`${name}="${raw}" ist keine Portnummer zwischen 1024 und 65535.`);
  }
  return raw;
}
const serverPort = portFromEnv("POSTGREST_SERVER_PORT");
const adminPort = portFromEnv("POSTGREST_ADMIN_PORT");
if (serverPort !== null && serverPort === adminPort) fail("POSTGREST_SERVER_PORT und POSTGREST_ADMIN_PORT sind gleich.");
if (existsSync(outFile) && !force) {
  fail(`${outFile} gibt es schon. Ersetzen nur mit --force (danach den Dienst neu starten, z. B. systemctl --user restart postgrest).`);
}
if (!existsSync(envFile)) fail(`${envFile} fehlt.`);

// --- Vorlage lesen, Ports festlegen ----------------------------------------------------
let conf = readFileSync(template, "utf8");
const uriLine = /^db-uri = "postgres:\/\/authenticator:PASSWORT@/m;
const fullUriLine = /^db-uri = ".*"$/m;
const secretConfLine = /^jwt-secret = ".*"$/m;
const serverPortLine = /^server-port = (\d+)$/m;
const adminPortLine = /^admin-server-port = (\d+)$/m;
if (![uriLine, secretConfLine, serverPortLine, adminPortLine].every((re) => re.test(conf))) {
  fail("Die Vorlage hat nicht mehr die erwarteten Zeilen db-uri, jwt-secret, server-port und admin-server-port. Skript anpassen.");
}
const effectiveServerPort = serverPort ?? conf.match(serverPortLine)[1];
const effectiveAdminPort = adminPort ?? conf.match(adminPortLine)[1];

// --- JWT-Geheimnis aus der .env, sonst neu ------------------------------------------------
let env = readFileSync(envFile, "utf8");

// Vor jeder Aenderung: Passt DATA_API_URL zur Daten-API, die hier entsteht?
const dataApiUrlVorher = env.match(/^DATA_API_URL=(["']?)(.*?)\1[ \t]*$/m)?.[2] ?? "";
if (dataApiUrlVorher !== "") {
  let apiPort = "";
  try {
    apiPort = new URL(dataApiUrlVorher).port;
  } catch {
    fail("DATA_API_URL in der .env ist keine gueltige Adresse.");
  }
  if (apiPort !== effectiveServerPort) {
    fail(
      `DATA_API_URL in der .env zeigt auf Port ${apiPort || "(keiner)"}, die Daten-API lauscht auf ` +
        `${effectiveServerPort}. Die App fragte sonst eine andere PostgREST-Instanz.`,
    );
  }
}
const secretLine = /^DATA_API_JWT_SECRET=(["']?)(.*?)\1[ \t]*$/m;
const match = env.match(secretLine);
let secret = match?.[2] ?? "";
let herkunft = "aus der .env uebernommen";
if (secret === "") {
  // 48 Zufallsbytes = 384 Bit, base64 ergibt 64 Zeichen. PostgREST verlangt mindestens 32.
  secret = randomBytes(48).toString("base64");
  const line = `DATA_API_JWT_SECRET="${secret}"`;
  env = match ? env.replace(secretLine, line) : `${env.replace(/\n*$/, "\n")}${line}\n`;
  // Erst daneben schreiben, dann umbenennen: eine halb geschriebene .env waere schlimmer als
  // gar keine Aenderung.
  writeFileSync(`${envFile}.neu`, env, { mode: 0o600 });
  renameSync(`${envFile}.neu`, envFile);
  herkunft = "neu erzeugt und in die .env eingetragen";
}
if (secret.length < 32) fail("DATA_API_JWT_SECRET in der .env ist kuerzer als 32 Zeichen. PostgREST lehnt das ab.");
if (/["\\\n]/.test(secret)) fail("DATA_API_JWT_SECRET enthaelt \", \\ oder einen Zeilenumbruch. Bitte neu erzeugen.");

const dataApiUrl = env.match(/^DATA_API_URL=(["']?)(.*?)\1[ \t]*$/m)?.[2] ?? "";

// --- Vorlage fuellen -------------------------------------------------------------------
// Ersetzen mit Funktionen statt Zeichenketten: In einer Ersatz-Zeichenkette haette $& oder $1
// eine Sonderbedeutung, und ein Geheimnis darf nie so umgedeutet werden.
conf =
  dbUri !== ""
    ? conf.replace(fullUriLine, () => `db-uri = "${dbUri}"`)
    : conf.replace(uriLine, () => `db-uri = "postgres://authenticator:${encodeURIComponent(pw)}@`);
conf = conf
  .replace(secretConfLine, () => `jwt-secret = "${secret}"`)
  .replace(serverPortLine, () => `server-port = ${effectiveServerPort}`)
  .replace(adminPortLine, () => `admin-server-port = ${effectiveAdminPort}`);
if (/PASSWORT|<eigenes Geheimnis/.test(conf)) fail("In der Konfiguration steht noch ein Platzhalter.");
// Ein Dollarzeichen leitet in dieser Datei eine Umgebungsvariable ein, $(NAME). Ein einzelnes
// ist ein Lesefehler, und PostgREST beendet sich beim Start sofort. Gemeldet wird nur die
// Zeilennummer, nie der Inhalt: Die Zeile koennte ein Geheimnis enthalten.
conf.split("\n").forEach((zeile, i) => {
  if (zeile.trimStart().startsWith("#")) return;
  if (/\$(?!\()/.test(zeile.replace(/\$\$/g, ""))) {
    fail(`Zeile ${i + 1} der Konfiguration enthaelt ein einzelnes $. In dieser Datei als $$ schreiben.`);
  }
});

writeFileSync(`${outFile}.neu`, conf, { mode: 0o600 });
chmodSync(`${outFile}.neu`, 0o600);
renameSync(`${outFile}.neu`, outFile);

// Zusammenfassung ohne Passwort. Bei einem Socket stehen Benutzer, Ordner und Port in den
// Parametern (host=, port=, user=) statt im Adressteil.
const uri = new URL(conf.match(/^db-uri = "(.*)"$/m)[1]);
const q = uri.searchParams;
const uriUser = decodeURIComponent(uri.username) || q.get("user") || "?";
const uriHost = q.get("host") || uri.hostname || "?";
const uriPort = q.get("port") || uri.port || "5432";
const uriPw = uri.password !== "" ? `Passwort ${decodeURIComponent(uri.password).length} Zeichen` : "ohne Passwort in der Adresse";
console.log(`postgrest.conf geschrieben: ${outFile} (Rechte 600)`);
console.log(`  db-uri:     ${uriUser}@${uriHost}:${uriPort}${uri.pathname}, ${uriPw}`);
console.log(`  Ports:      Daten-API ${effectiveServerPort}, Verwaltung ${effectiveAdminPort} (nur 127.0.0.1)`);
console.log(`  jwt-secret: ${secret.length} Zeichen, ${herkunft}`);
// DATA_API_URL bleibt bis zum Cutover A (Schritt 5.5) leer: Solange sie leer ist, laufen alle
// Daten weiter ueber Supabase. Gesetzt, wuerde die Anwendung schon die neue Datenbank lesen.
console.log(
  `  DATA_API_URL in der .env: ${dataApiUrl === "" ? "leer, richtig bis Cutover A (Schritt 5.5)" : `${dataApiUrl} (Daten laufen schon ueber PostgREST)`}`,
);
