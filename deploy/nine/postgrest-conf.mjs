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

const pw = process.env.AUTHENTICATOR_PW ?? "";
if (pw.length < 16) {
  fail("AUTHENTICATOR_PW fehlt oder ist kuerzer als 16 Zeichen. Aufruf siehe Kopf dieser Datei.");
}
if (existsSync(outFile) && !force) {
  fail(`${outFile} gibt es schon. Ersetzen nur mit --force (danach: systemctl --user restart postgrest).`);
}
if (!existsSync(envFile)) fail(`${envFile} fehlt.`);

// --- JWT-Geheimnis aus der .env, sonst neu ------------------------------------------------
let env = readFileSync(envFile, "utf8");
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
let conf = readFileSync(template, "utf8");
const uriLine = /^db-uri = "postgres:\/\/authenticator:PASSWORT@/m;
const secretConfLine = /^jwt-secret = ".*"$/m;
if (!uriLine.test(conf) || !secretConfLine.test(conf)) {
  fail("Die Vorlage hat nicht mehr die erwarteten Zeilen db-uri und jwt-secret. Skript anpassen.");
}
conf = conf
  .replace(uriLine, `db-uri = "postgres://authenticator:${encodeURIComponent(pw)}@`)
  .replace(secretConfLine, `jwt-secret = "${secret}"`);
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

const uri = new URL(conf.match(/^db-uri = "(.*)"$/m)[1]);
console.log(`postgrest.conf geschrieben: ${outFile} (Rechte 600)`);
console.log(`  db-uri:     ${uri.username}@${uri.hostname}:${uri.port}${uri.pathname}, Passwort ${pw.length} Zeichen`);
console.log(`  jwt-secret: ${secret.length} Zeichen, ${herkunft}`);
// DATA_API_URL bleibt bis zum Cutover A (Schritt 5.5) leer: Solange sie leer ist, laufen alle
// Daten weiter ueber Supabase. Gesetzt, wuerde die Anwendung schon die neue Datenbank lesen.
console.log(
  `  DATA_API_URL in der .env: ${dataApiUrl === "" ? "leer, richtig bis Cutover A (Schritt 5.5)" : `${dataApiUrl} (Daten laufen schon ueber PostgREST)`}`,
);
