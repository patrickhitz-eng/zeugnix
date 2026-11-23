// Prüft vor einem Deployment, ob die Umgebungsvariablen vollständig und plausibel sind –
// damit ein Tippfehler als klare Meldung auftaucht statt als kryptischer Fehler im
// Betrieb. Gibt nie Werte aus, nur Befunde.
//
// Von Hand auf dem Server:  node --env-file=.env scripts/check-env.mjs
// Im Deployment:            läuft automatisch als Hook des advisori01-Kits, vor npm ci
//                           (deploy/nine/hooks/pre-install.sh), und bei `--check`.
//
// Die Prüfungen hier sind nicht allgemein gehalten, sondern jede einzelne steht für einen
// Fehler, der in diesem Projekt schon einmal Geld oder Vertrauen gekostet hätte.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const errors = [];
const warnings = [];
const env = process.env;
const onVercel = Boolean(env.VERCEL);
const target = onVercel ? "Vercel" : "Server (nine.ch)";

function nonEmpty(name) {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// --- Datenbank -------------------------------------------------------------------------
// Die Anwendung selbst braucht DATABASE_URL nicht (sie geht über die Daten-API), aber der
// Migrations-Läufer und die Sicherung brauchen sie. Auf Vercel gibt es sie nicht.
if (!onVercel) {
  const raw = nonEmpty("DATABASE_URL");
  if (!raw) {
    errors.push("DATABASE_URL fehlt. Ohne sie laufen weder Migrationen noch Sicherung.");
  } else {
    let url;
    try {
      url = new URL(raw);
    } catch {
      errors.push(
        "DATABASE_URL ist keine gültige Adresse. Sonderzeichen im Passwort müssen " +
          "URL-kodiert sein (@ wird %40, : wird %3A, / wird %2F, # wird %23).",
      );
    }
    if (url) {
      const protocol = url.protocol.replace(/:$/, "");
      const host = url.hostname;
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (!["postgresql", "postgres"].includes(protocol)) {
        errors.push(`DATABASE_URL beginnt mit "${protocol}://" – erwartet wird postgresql://.`);
      }
      if (!url.password) {
        errors.push("DATABASE_URL enthält kein Passwort.");
      } else if (["PASSWORT", "[YOUR-PASSWORD]", "YOUR-PASSWORD"].includes(decodeURIComponent(url.password))) {
        errors.push("DATABASE_URL enthält noch den Platzhalter für das Passwort.");
      }
      if (!isLocal) {
        warnings.push(
          `DATABASE_URL zeigt auf ${host} statt auf 127.0.0.1. Auf advisori01 laufen App ` +
            "und Datenbank auf derselben Maschine – ein anderer Host heisst, dass die " +
            "Daten den Server verlassen.",
        );
      }
      if (host.endsWith(".supabase.com") || host.endsWith(".supabase.co")) {
        errors.push(
          "DATABASE_URL zeigt auf Supabase. Die Daten liegen seit Cutover A auf advisori01; " +
            "Migrationen und Sicherung gehören an die Datenbank auf 127.0.0.1.",
        );
      }
    }
  }
}

// --- Eigene Daten-API -------------------------------------------------------------------
// Die Anwendung liest und schreibt nur über PostgREST auf derselben Maschine
// (lib/db/supabase-server.ts). Ohne DATA_API_URL gibt es keine Daten und keine Anmeldung.
const dataApi = nonEmpty("DATA_API_URL");
if (!dataApi) {
  errors.push(
    "DATA_API_URL fehlt. Ohne eigene Daten-API (PostgREST auf 127.0.0.1) gibt es weder " +
      "Daten noch Anmeldung.",
  );
} else {
  let url;
  try {
    url = new URL(dataApi);
  } catch {
    errors.push("DATA_API_URL ist keine gültige Adresse.");
  }
  if (url) {
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    if (!isLoopback) {
      errors.push(
        `DATA_API_URL zeigt auf ${url.hostname}. Die Daten-API darf nur über 127.0.0.1 ` +
          "erreichbar sein – sonst hängt die Datenbank ohne eigenes Zertifikat, ohne " +
          "Zugriffsschutz und ohne CORS-Grenze am offenen Netz.",
      );
    }
    if (url.pathname !== "/") {
      errors.push("DATA_API_URL bitte ohne Pfad angeben (nur Schema, Host und Port).");
    }
  }
}

// Das Geheimnis, mit dem die Anwendung die Zugangstoken für die Daten-API ausstellt.
// Es muss identisch zu jwt-secret in ~/zeugnio/shared/postgrest.conf sein – stimmt es
// nicht, antwortet die Daten-API auf JEDE Anfrage mit 401. Siehe lib/db/rest-rewrite.ts.
const apiSecret = nonEmpty("DATA_API_JWT_SECRET");
if (!apiSecret) {
  errors.push(
    "DATA_API_JWT_SECRET fehlt. Erzeugen mit openssl rand -base64 48 und denselben Wert " +
      "als jwt-secret in postgrest.conf eintragen.",
  );
} else if (apiSecret.length < 32) {
  errors.push("DATA_API_JWT_SECRET ist zu kurz (mindestens 32 Zeichen).");
}

// --- Anmeldung ---------------------------------------------------------------------------
// zeugnio meldet seit Cutover B selbst an (lib/auth/*). Die HMAC-Werte von Link, Code und
// Sitzung brauchen ein eigenes Geheimnis. Ein fehlendes Geheimnis wäre kein harmloser
// Fehler: ohne Schlüssel liessen sich die 6-stelligen Codes aus einem Datenbankauszug in
// Sekunden durchprobieren.
const authSecret = nonEmpty("ZEUGNIO_AUTH_SECRET");
if (!authSecret) {
  errors.push(
    "ZEUGNIO_AUTH_SECRET fehlt. Ohne Geheimnis kann sich niemand anmelden. Erzeugen mit: " +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
  );
} else if (authSecret.length < 32) {
  errors.push("ZEUGNIO_AUTH_SECRET ist zu kurz (mindestens 32 Zeichen).");
} else if ([apiSecret, nonEmpty("CRON_SECRET")].includes(authSecret)) {
  errors.push("ZEUGNIO_AUTH_SECRET ist identisch mit einem anderen Geheimnis. Es muss ein eigener Wert sein.");
}

// Den Schalter ZEUGNIO_AUTH (supabase|eigen) gibt es seit B2 nicht mehr, es gilt nur noch
// die eigene Anmeldung. Eine stehengebliebene Zeile stört nicht, niemand liest sie. Sie
// könnte aber glauben machen, mit "supabase" gäbe es einen Rückweg. Darum ein Hinweis.
if (nonEmpty("ZEUGNIO_AUTH") !== null) {
  warnings.push(
    "ZEUGNIO_AUTH steht noch in der .env. Der Schalter wird seit B2 nicht mehr gelesen " +
      "(es gilt nur die eigene Anmeldung); die Zeile kann weg.",
  );
}

// Supabase-Variablen aus der Zeit vor B2: Der Code liest sie nicht mehr. Nur der Name
// wird genannt, nie ein Wert.
const supabaseLeftovers = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ZEUGNIO_OWN_AUTH",
].filter((name) => nonEmpty(name) !== null);
if (supabaseLeftovers.length > 0) {
  warnings.push(
    `${supabaseLeftovers.join(", ")} ${supabaseLeftovers.length > 1 ? "stehen" : "steht"} noch in der .env. Der Code liest sie ` +
      "seit B2 nicht mehr; die Zeilen können weg.",
  );
}

// --- Öffentliche Adresse ----------------------------------------------------------------
const siteUrl = nonEmpty("NEXT_PUBLIC_SITE_URL");
if (!siteUrl) {
  errors.push("NEXT_PUBLIC_SITE_URL fehlt – Links in E-Mails und QR-Codes zeigen dann ins Leere.");
} else {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    errors.push("NEXT_PUBLIC_SITE_URL ist keine gültige Adresse (erwartet https://zeugnio.ch).");
  }
  if (url) {
    if (url.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_SITE_URL muss mit https:// beginnen – der QR-Scan auf dem Handy verlangt es.");
    }
    if (url.pathname !== "/" || siteUrl.endsWith("/")) {
      warnings.push("NEXT_PUBLIC_SITE_URL bitte ohne Pfad und ohne Schrägstrich am Ende angeben.");
    }
    if (url.hostname !== "zeugnio.ch" && !onVercel) {
      warnings.push(
        `NEXT_PUBLIC_SITE_URL zeigt auf ${url.hostname}. Jedes Zeugnis, das jetzt ` +
          "finalisiert wird, trägt diese Adresse dauerhaft im QR-Code. Für die Vollprobe " +
          "auf der Testadresse in Ordnung – dann aber ausschliesslich mit Testdaten.",
      );
    }
  }
}

// --- Signatur ---------------------------------------------------------------------------
const signingKey = nonEmpty("ZEUGNIO_SIGNING_PRIVATE_KEY");
if (!signingKey) {
  warnings.push(
    "ZEUGNIO_SIGNING_PRIVATE_KEY fehlt. Die App läuft weiter, stellt aber unsignierte " +
      "Zeugnisse aus. Dieser Schlüssel wird NICHT neu erzeugt – er kommt aus dem " +
      "Passwort-Manager, sonst sind alle bisherigen Signaturen unprüfbar.",
  );
} else if (signingKey.includes("PUBLIC KEY")) {
  errors.push("ZEUGNIO_SIGNING_PRIVATE_KEY enthält einen öffentlichen Schlüssel.");
}

const retiredKeys = nonEmpty("ZEUGNIO_SIGNING_PUBLIC_KEYS");
if (retiredKeys) {
  try {
    const parsed = JSON.parse(retiredKeys);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push("ZEUGNIO_SIGNING_PUBLIC_KEYS muss ein JSON-Objekt sein.");
    } else if (Object.values(parsed).some((v) => typeof v === "string" && v.includes("PRIVATE KEY"))) {
      errors.push("ZEUGNIO_SIGNING_PUBLIC_KEYS enthält einen privaten Schlüssel.");
    }
  } catch {
    errors.push("ZEUGNIO_SIGNING_PUBLIC_KEYS ist kein gültiges JSON.");
  }
}

// --- Geplante Aufgaben -------------------------------------------------------------------
const cronSecret = nonEmpty("CRON_SECRET");
if (!cronSecret) {
  errors.push("CRON_SECRET fehlt – /api/cron/pii-cleanup läuft dann nie, und die Löschfristen verstreichen still.");
} else if (cronSecret.length < 24) {
  errors.push("CRON_SECRET ist zu kurz (mindestens 24 Zeichen). Erzeugen mit: openssl rand -base64 32");
}

// --- Logos ------------------------------------------------------------------------------
const uploadDir = nonEmpty("ZEUGNIO_UPLOAD_DIR");
if (uploadDir && !onVercel) {
  if (uploadDir.includes("/releases/")) {
    errors.push(
      "ZEUGNIO_UPLOAD_DIR liegt innerhalb eines Release-Ordners. Das nächste Deployment " +
        "räumt den Ordner ab und nimmt alle Firmenlogos mit. Unter shared/ ablegen.",
    );
  } else if (!existsSync(uploadDir)) {
    errors.push(`ZEUGNIO_UPLOAD_DIR zeigt auf ${uploadDir}, dort ist kein Verzeichnis. Anlegen: mkdir -p`);
  } else if (!statSync(uploadDir).isDirectory()) {
    errors.push("ZEUGNIO_UPLOAD_DIR ist kein Verzeichnis.");
  }
}

// --- E-Mail ------------------------------------------------------------------------------
if (!nonEmpty("RESEND_API_KEY")) {
  // zeugnio schickt die Anmelde-Mail selbst. Ohne Schlüssel antwortet /api/auth/anfordern
  // zwar «Mail ist unterwegs», aber es kommt keine an, und niemand kann sich mehr anmelden.
  // Darum ein Fehler statt einer Warnung.
  errors.push(
    "RESEND_API_KEY fehlt. Die Anmelde-Mails gehen dann nicht hinaus, und niemand kann sich anmelden.",
  );
} else if (!nonEmpty("EMAIL_FROM")) {
  warnings.push("EMAIL_FROM fehlt, obwohl ein Mailversand konfiguriert ist.");
}

// --- Sicherung ins zweite Rechenzentrum --------------------------------------------------
// Der Zugang steht seit dem advisori01-Kit in shared/backup-s3.env, neben der .env und
// bewusst nicht darin: die .env liest auch `next start`, die Schlüssel lägen sonst in der
// Umgebung jedes Next-Prozesses. Die Datei wird über die echte Lage der .env gefunden (im
// Release-Ordner ist .env eine Verknüpfung nach shared/). Gelesen wird nur, ob ein Wert
// gesetzt ist, nie der Wert selbst.
//
// Gezählt werden nur Bucket und Zugangsdaten. S3_ENDPOINT füllt die Vorlage des Kits schon
// vor; mitgezählt stünde eine frisch kopierte Vorlage sonst als «1 von 4, halb gesetzt» da.
const s3Access = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];

function readS3File() {
  let file;
  try {
    file = path.join(path.dirname(realpathSync(".env")), "backup-s3.env");
  } catch {
    return null; // keine .env im Arbeitsordner, z. B. lokal mit .env.local
  }
  if (!existsSync(file)) return null;
  const set = new Map();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(S3_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^(["'])(.*)\1$/, "$2").trim();
    set.set(m[1], value !== "");
  }
  return set;
}

if (!onVercel) {
  const inEnv = ["S3_ENDPOINT", ...s3Access].filter((name) => nonEmpty(name));
  if (inEnv.length > 0) {
    warnings.push(
      `${inEnv.join(", ")} steht in der .env. Der Zugang gehört nach shared/backup-s3.env ` +
        "(advisori01-Kit): die .env liest auch `next start`, die Schlüssel lägen sonst in " +
        "jedem Next-Prozess.",
    );
  }
  const fromFile = readS3File();
  const isSet = (name) => Boolean(nonEmpty(name)) || fromFile?.get(name) === true;
  const accessSet = s3Access.filter(isSet);
  if (accessSet.length === 0) {
    warnings.push(
      "Kein Object Storage konfiguriert (shared/backup-s3.env): die Sicherung bleibt auf " +
        "derselben Maschine wie die Datenbank. Das ist im Ernstfall keine Sicherung.",
    );
  } else if (accessSet.length !== s3Access.length || !isSet("S3_ENDPOINT")) {
    errors.push(
      `Object Storage nur teilweise konfiguriert (${accessSet.length} von ${s3Access.length} ` +
        "Zugangswerten" +
        (isSet("S3_ENDPOINT") ? "" : ", S3_ENDPOINT fehlt") +
        "). Halb gesetzt heisst: die Sicherung scheitert jede Stunde, und niemand merkt es.",
    );
  }
}

// --- Kleinigkeiten, die still schiefgehen ------------------------------------------------
if (nonEmpty("CSP_REPORT_ONLY") && !onVercel) {
  warnings.push(
    "CSP_REPORT_ONLY ist gesetzt: die Content-Security-Policy meldet nur, statt zu " +
      "blockieren. Für eine Messung nach dem Umzug richtig, im Dauerbetrieb nicht.",
  );
}

const major = Number(process.versions.node.split(".")[0]);
if (!onVercel && major !== 22) {
  warnings.push(`Node ${process.versions.node} läuft, .nvmrc verlangt 22. Der Build kann anders ausfallen als getestet.`);
}

// --- Ausgabe -----------------------------------------------------------------------------
console.log(`Konfigurations-Prüfung (${target})`);
for (const warning of warnings) console.log(`  Hinweis: ${warning}`);
for (const error of errors) console.error(`  FEHLER:  ${error}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} Fehler – Deployment abgebrochen. Werte korrigieren und erneut starten.`);
  process.exit(1);
}
console.log(warnings.length > 0 ? `  OK, mit ${warnings.length} Hinweis(en).` : "  OK.");
