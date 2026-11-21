// PM2-Konfiguration fuer zeugnio.ch auf dem Managed Server bei nine.ch - von deploy.sh gestartet.
//
// Genau eine Instanz im fork-Modus. Das ist zunaechst eine Vorsichtsmassnahme, keine Notwendigkeit:
// seit supabase/023_rate_limit_durable.sql zaehlt das Rate-Limit in der Datenbank, nicht im
// Arbeitsspeicher, darum waeren mehrere Instanzen moeglich. Der Umstieg auf instances: 2 und
// `pm2 reload` (statt delete+start) beseitigt die Unterbrechung beim Deployment von einigen
// Sekunden - aber nicht im Cutover-Fenster einfuehren, sondern danach und mit einer curl-Schleife
// nachgemessen.
//
// Die App lauscht nur auf 127.0.0.1. Von aussen ist sie ausschliesslich ueber nines nginx mit TLS
// erreichbar. `next start` liest die .env selbst aus dem Release-Ordner (Verknuepfung auf
// ~/zeugnio/shared/.env).
//
// Name und Port kommen aus der Umgebung, die das Kit setzt (deploy.sh: APP_DIR und PORT aus
// apps/<app>/kit.conf). So laufen zwei Instanzen aus demselben Repo nebeneinander:
//   zeugnio       APP_DIR ~/zeugnio,       Port 3010  (Produktion)
//   zeugnio-test  APP_DIR ~/zeugnio-test,  Port 3013  (Testinstanz, deploy/nine/cutover-b-testinstanz.md)
// Der pm2-Name ist der Ordnername von APP_DIR. Ohne APP_DIR und PORT ergibt sich genau das
// Bisherige: «zeugnio» auf Port 3010. deploy.sh prueft vor dem Umschalten, dass der Name hier
// gleich APP_NAME ist (check_ecosystem); ein falscher Name faellt also vor dem Neustart auf.
const os = require("node:os");
const path = require("node:path");

const appDir = process.env.APP_DIR || path.join(os.homedir(), "zeugnio");
const name = path.basename(appDir);
const port = process.env.PORT || "3010";

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  throw new Error(`APP_DIR endet auf "${name}" - erwartet ein Ordnername wie zeugnio oder zeugnio-test.`);
}
if (!/^[0-9]+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error(`PORT "${port}" ist keine Portnummer zwischen 1024 und 65535.`);
}

module.exports = {
  apps: [
    {
      name,
      // cwd MUSS auf current zeigen, nicht auf den Release-Ordner: lib/pdf/certificate.tsx loest die
      // Schriftdateien ueber process.cwd() auf. Zeigt cwd auf einen alten Release, erzeugt die
      // PDF-Route Zeugnisse in Helvetica statt in Inter - ohne Fehlermeldung.
      cwd: path.join(appDir, "current"),
      script: "node_modules/next/dist/bin/next",
      args: `start --hostname 127.0.0.1 --port ${port}`,
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      // Die App braucht im Betrieb rund ein halbes Gigabyte. @react-pdf/renderer haelt Schriften im
      // Speicher, darum etwas Luft - bei einem Leck lieber neu starten als den OOM-Killer riskieren,
      // der auf diesem Server im schlimmsten Fall PostgreSQL trifft und damit alle Produkte.
      max_memory_restart: "1G",
      // Eine laufende PDF-Erzeugung darf beim Neustart noch fertig werden (bis 30 s vorgesehen,
      // 15 s sind der Kompromiss gegen ein haengendes Deployment).
      kill_timeout: 15000,
      time: true,
    },
  ],
};
