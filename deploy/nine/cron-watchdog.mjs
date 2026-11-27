// Sieht alle fuenf Minuten nach, ob zeugnio und die Daten-API antworten - und startet die
// Anwendung genau einmal neu, wenn sie es nicht tut.
//
// Warum es das braucht: auf diesem Server gibt es kein SLA mit Pikettdienst (nine antwortet
// Mo-Fr 09-18 Uhr), und vier Anwendungen teilen 8 GB Arbeitsspeicher. Der wahrscheinlichste
// Ausfall ist darum kein Absturz, sondern ein Prozess, den der OOM-Killer geholt hat.
//
// usage: node deploy/nine/cron-watchdog.mjs
//
// Crontab-Zeile (crontab -e als www-zeugnio):
//   */5 * * * * cd $HOME/zeugnio/current && $HOME/.nvm/nvm-exec node deploy/nine/cron-watchdog.mjs >> $HOME/zeugnio/logs/watchdog.log 2>&1
//
// Was dieses Skript ausdruecklich NICHT tut: die Daten-API neu starten. Antwortet PostgREST
// nicht, liegt das fast immer an der Datenbank - und dann macht ein Neustart nichts besser,
// verdeckt aber die Ursache. systemd startet den Dienst ohnehin bis zu fuenfmal neu
// (StartLimitBurst in postgrest.service); danach ist Hinsehen die richtige Reaktion.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

// Die Befunde (welcher Teil nicht "ok" ist) nennt /api/health nur mit CRON_SECRET; ohne
// steht im Log bloss {"ok":false}. Darum das Geheimnis aus shared/.env lesen, wenn es geht.
// Fehlt die Datei, prueft der Watchdog trotzdem: Entscheidend ist der HTTP-Status.
//
// Bewusst parseEnv statt process.loadEnvFile: loadEnvFile schriebe die ganze .env in die
// Umgebung dieses Prozesses, und "pm2 restart --update-env" unten gaebe sie an die App weiter.
// Gelesen wird nur dieser eine Wert, ausgegeben wird er nie.
function readCronSecret() {
  if (process.env.CRON_SECRET?.trim()) return process.env.CRON_SECRET.trim();
  const envFile = process.env.ENV_FILE ?? path.join(os.homedir(), "zeugnio", "shared", ".env");
  try {
    return parseEnv(readFileSync(envFile, "utf8")).CRON_SECRET?.trim() || "";
  } catch {
    return ""; // ohne Geheimnis weiter, nur mit weniger Einzelheiten im Log
  }
}
const cronSecret = readCronSecret();

const port = process.env.APP_PORT ?? "3010";
const healthUrl = process.env.HEALTH_URL ?? `http://127.0.0.1:${port}/api/health`;
const dataApiUrl = process.env.DATA_API_READY_URL ?? "http://127.0.0.1:3012/ready";
const appName = process.env.APP_NAME ?? "zeugnio";
const now = () => new Date().toISOString();

async function probe(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return { ok: response.ok, detail: `HTTP ${response.status}`, body: await response.text() };
  } catch (error) {
    return { ok: false, detail: error.message, body: "" };
  }
}

const dataApi = await probe(dataApiUrl);
if (!dataApi.ok) {
  console.error(`[watchdog] ${now()} Daten-API antwortet nicht (${dataApi.detail}).`);
  console.error("[watchdog] Kein automatischer Neustart - zuerst: systemctl --user status postgrest");
  process.exitCode = 1;
}

const healthHeaders = cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};

let app = await probe(healthUrl, healthHeaders);
if (app.ok) {
  // /api/health antwortet mit 503, sobald ein Befund darin nicht "ok" lautet - ein 200 heisst
  // also nicht nur "der Prozess lebt", sondern auch "Daten, Schriften und Umgebung stimmen".
  process.exit(process.exitCode ?? 0);
}

console.error(`[watchdog] ${now()} Anwendung antwortet nicht (${app.detail}) ${app.body.slice(0, 300)}`);

// Genau ein Versuch. Eine Neustart-Schleife wuerde aus einem Ausfall, den ein Mensch in zehn
// Minuten behebt, einen machen, der tagelang niemandem auffaellt.
const restart = spawnSync("pm2", ["restart", appName, "--update-env"], { encoding: "utf8" });
if (restart.error) {
  console.error(`[watchdog] pm2 nicht startbar: ${restart.error.message}`);
  process.exit(1);
}
console.error(`[watchdog] ${now()} pm2 restart ${appName}: Rueckgabewert ${restart.status}`);

// Der Anwendung Zeit geben, hochzufahren, bevor nachgesehen wird.
await new Promise((resolve) => setTimeout(resolve, 15_000));

app = await probe(healthUrl, healthHeaders);
if (app.ok) {
  console.error(`[watchdog] ${now()} nach dem Neustart wieder erreichbar.`);
  // Trotzdem Rueckgabewert 1: ein Neustart ist ein Vorfall, kein Normalzustand, und soll
  // im Log als solcher stehen.
  process.exit(1);
}

console.error(`[watchdog] ${now()} auch nach dem Neustart kein Lebenszeichen (${app.detail}).`);
console.error("[watchdog] Naechster Schritt: pm2 logs zeugnio --lines 80");
process.exit(1);
