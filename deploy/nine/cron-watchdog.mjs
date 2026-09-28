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

const port = process.env.APP_PORT ?? "3010";
const healthUrl = process.env.HEALTH_URL ?? `http://127.0.0.1:${port}/api/health`;
const dataApiUrl = process.env.DATA_API_READY_URL ?? "http://127.0.0.1:3012/ready";
const appName = process.env.APP_NAME ?? "zeugnio";
const now = () => new Date().toISOString();

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
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

let app = await probe(healthUrl);
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

app = await probe(healthUrl);
if (app.ok) {
  console.error(`[watchdog] ${now()} nach dem Neustart wieder erreichbar.`);
  // Trotzdem Rueckgabewert 1: ein Neustart ist ein Vorfall, kein Normalzustand, und soll
  // im Log als solcher stehen.
  process.exit(1);
}

console.error(`[watchdog] ${now()} auch nach dem Neustart kein Lebenszeichen (${app.detail}).`);
console.error("[watchdog] Naechster Schritt: pm2 logs zeugnio --lines 80");
process.exit(1);
