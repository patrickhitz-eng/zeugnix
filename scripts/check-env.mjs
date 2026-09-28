// Prüft vor einem Deployment, ob die Umgebungsvariablen vollständig und plausibel sind –
// damit ein Tippfehler als klare Meldung auftaucht statt als kryptischer Fehler im
// Betrieb. Gibt nie Werte aus, nur Befunde.
//
// Von Hand auf dem Server:  node --env-file=.env scripts/check-env.mjs
// Im Deployment:            läuft automatisch in deploy/nine/deploy.sh, vor dem Build.
//
// Die Prüfungen hier sind nicht allgemein gehalten, sondern jede einzelne steht für einen
// Fehler, der in diesem Projekt schon einmal Geld oder Vertrauen gekostet hätte.
import { existsSync, statSync } from "node:fs";

const errors = [];
const warnings = [];
const env = process.env;
const onVercel = Boolean(env.VERCEL);
const target = onVercel ? "Vercel" : "Server (nine.ch)";

/** Liest den role-Anspruch aus einem JWT, ohne die Signatur zu prüfen und ohne den Wert
 *  irgendwo auszugeben. Gibt null zurück, wenn es kein JWT ist. */
function jwtRole(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

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
      if (host.endsWith(".pooler.supabase.com") && url.port === "6543") {
        errors.push(
          "DATABASE_URL nutzt den Supabase Transaction Pooler (Port 6543). Damit " +
            "scheitern Migrationen – die Zeichenfolge des Session Pooler (Port 5432) nehmen.",
        );
      }
    }
  }
}

// --- Supabase: Adresse ------------------------------------------------------------------
// Das ist die Prüfung, die einen stillen Totalausfall verhindert. Näheres in
// lib/db/rest-rewrite.ts: wird diese Adresse umgebogen, läuft die Anmeldung ins 404 und
// zugleich ändert sich der Name des Sitzungs-Cookies, was jede Anmeldung entwertet.
const supabaseUrl = nonEmpty("NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseUrl) {
  errors.push("NEXT_PUBLIC_SUPABASE_URL fehlt.");
} else {
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL ist keine gültige Adresse.");
  }
  if (url && !url.hostname.endsWith(".supabase.co") && !env.ZEUGNIO_OWN_AUTH) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_URL zeigt auf ${url.hostname} und nicht auf Supabase. Solange ` +
        "die Anmeldung über Supabase läuft, muss hier die Supabase-Adresse stehen: " +
        "supabase-js leitet daraus auch die Anmelde-Endpunkte UND den Namen des " +
        "Sitzungs-Cookies ab. Die Daten werden über DATA_API_URL umgelenkt, nicht hier. " +
        "Erst wenn die eigene Anmeldung steht (Cutover B), diese Prüfung mit " +
        "ZEUGNIO_OWN_AUTH=1 abschalten.",
    );
  }
}

// --- Supabase: Schlüssel ----------------------------------------------------------------
const anonKey = nonEmpty("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = nonEmpty("SUPABASE_SERVICE_ROLE_KEY");
const dataApi = nonEmpty("DATA_API_URL");

if (!anonKey) errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
if (!serviceKey) errors.push("SUPABASE_SERVICE_ROLE_KEY fehlt.");
if (anonKey && serviceKey && anonKey === serviceKey) {
  errors.push(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY sind identisch. Der " +
      "Service-Schlüssel umgeht die Zeilensicherheit und läge damit im Browser.",
  );
}

// Vertauschte Schlüssel sehen im Dashboard fast gleich aus. Der Anspruch im Token sagt es
// eindeutig – und der Rollenname ist kein Geheimnis, er darf hier stehen.
for (const [name, value, expected] of [
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, "anon"],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey, "service_role"],
]) {
  if (!value) continue;
  const role = jwtRole(value);
  if (role === null) {
    // Neues Schlüsselformat (sb_publishable_… / sb_secret_…): gegen Supabase funktioniert
    // es, gegen die eigene Daten-API nicht – PostgREST braucht ein JWT als Bearer-Token.
    if (dataApi) {
      errors.push(
        `${name} ist kein JWT. Die eigene Daten-API prüft Bearer-Token und kann mit dem ` +
          "neuen Supabase-Schlüsselformat nichts anfangen. Im Dashboard unter API Keys " +
          "die JWT-basierten Schlüssel verwenden (Legacy/JWT), sonst antwortet die " +
          "Daten-API auf jede Anfrage mit 401.",
      );
    } else {
      warnings.push(`${name} ist kein JWT – vor dem Cutover prüfen, siehe DATA_API_URL.`);
    }
  } else if (role !== expected) {
    errors.push(
      `${name} trägt die Rolle "${role}", erwartet ist "${expected}". Die Schlüssel sind ` +
        "vertauscht – das ist entweder ein Datenleck oder eine App ohne Rechte.",
    );
  }
}

// --- Eigene Daten-API -------------------------------------------------------------------
if (dataApi) {
  let url;
  try {
    url = new URL(dataApi);
  } catch {
    errors.push("DATA_API_URL ist keine gültige Adresse.");
  }
  if (url) {
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
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
} else if (!onVercel) {
  warnings.push(
    "DATA_API_URL ist nicht gesetzt: die App liest und schreibt weiterhin bei Supabase, " +
      "also nicht in der Schweiz. Das ist vor dem Cutover der richtige Zustand.",
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
  warnings.push("RESEND_API_KEY fehlt – Einladungen an Vorgesetzte werden nicht verschickt.");
} else if (!nonEmpty("EMAIL_FROM")) {
  warnings.push("EMAIL_FROM fehlt, obwohl ein Mailversand konfiguriert ist.");
}

// --- Sicherung ins zweite Rechenzentrum --------------------------------------------------
const s3 = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const s3Set = s3.filter((name) => nonEmpty(name));
if (!onVercel) {
  if (s3Set.length === 0) {
    warnings.push(
      "Kein Object Storage konfiguriert: die Sicherung bleibt auf derselben Maschine wie " +
        "die Datenbank. Das ist im Ernstfall keine Sicherung.",
    );
  } else if (s3Set.length !== s3.length) {
    errors.push(
      `Object Storage nur teilweise konfiguriert (${s3Set.length} von ${s3.length} Werten). ` +
        "Halb gesetzt heisst: die Sicherung scheitert jede Nacht, und niemand merkt es.",
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
