// Stoesst die Loeschung abgelaufener Personendaten an - der Ersatz fuer den Vercel-Cron.
//
// Auf Vercel rief die Plattform /api/cron/pii-cleanup taeglich auf und legte das Geheimnis
// selbst als Authorization-Kopfzeile bei. Auf dem eigenen Server macht das dieses Skript,
// aufgerufen aus dem Cron des Anwendungsbenutzers.
//
// usage: node deploy/nine/cron-pii-cleanup.mjs
//
// Crontab-Zeile (crontab -e als www-zeugnio). CRON_TZ ist hier nicht Kosmetik: ohne die
// Angabe laeuft der Eintrag in der Zeitzone des Servers, und zweimal im Jahr - bei der
// Zeitumstellung - entweder zweimal oder gar nicht:
//
//   CRON_TZ=UTC
//   15 2 * * * cd $HOME/zeugnio/current && $HOME/.nvm/nvm-exec node deploy/nine/cron-pii-cleanup.mjs >> $HOME/zeugnio/logs/cron-pii.log 2>&1
//
// Der Rueckgabewert ist 1, sobald die Route nicht mit 2xx antwortet. Das ist der Punkt: ein
// Loeschlauf, der still ausfaellt, laesst Personendaten ueber die Frist hinaus liegen - und
// das faellt sonst erst auf, wenn jemand danach fragt.
import os from "node:os";
import path from "node:path";

const envFile = process.env.ENV_FILE ?? path.join(os.homedir(), "zeugnio", "shared", ".env");
const port = process.env.APP_PORT ?? "3010";
const url = process.env.CRON_TARGET_URL ?? `http://127.0.0.1:${port}/api/cron/pii-cleanup`;

try {
  process.loadEnvFile(envFile);
} catch {
  console.error(`[cron-pii] ${envFile} nicht lesbar.`);
  process.exit(1);
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("[cron-pii] CRON_SECRET fehlt - die Route wuerde mit 401 antworten.");
  process.exit(1);
}

const started = Date.now();
let response;
try {
  response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(120_000),
  });
} catch (error) {
  console.error(`[cron-pii] ${new Date().toISOString()} Aufruf fehlgeschlagen: ${error.message}`);
  process.exit(1);
}

const body = await response.text();
const seconds = Math.round((Date.now() - started) / 1000);

if (!response.ok) {
  console.error(`[cron-pii] ${new Date().toISOString()} HTTP ${response.status} nach ${seconds}s: ${body.slice(0, 500)}`);
  process.exit(1);
}

console.log(`[cron-pii] ${new Date().toISOString()} ok nach ${seconds}s: ${body.slice(0, 500)}`);
