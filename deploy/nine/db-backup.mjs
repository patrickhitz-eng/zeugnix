// Eigene, verschluesselte Sicherung von zeugnio - zusaetzlich zur taeglichen Sicherung von nine.
//
// WARUM ZUSAETZLICH: nine sichert einmal taeglich zwischen 02 und 03 Uhr und haelt zehn Tage.
// Point-in-Time-Recovery gibt es nicht. Ein Zeugnis, das um 14 Uhr ausgestellt wird, ist nach
// einem Rueckspielen auf den Stand von 02 Uhr nicht mehr in der Datenbank - und weil
// app/api/verify/route.ts am Treffer in der Datenbank entscheidet, meldet die Echtheitspruefung
// dann "unbekannt" fuer ein Zeugnis, das jemand in der Hand haelt. Die Ed25519-Signatur rettet
// das nicht. Darum: stuendlich sichern und in ein zweites Rechenzentrum kopieren.
//
// usage: node deploy/nine/db-backup.mjs [--journal-only] [--full]
//
//   ohne Angabe     Datenbank-Auszug + Journal, Logos nur wenn sie sich geaendert haben
//   --journal-only  nur das Journal (klein, fuer haeufige Laeufe)
//   --full          erzwingt auch das Logo-Archiv
//
// Optional per Umgebungsvariable:
//   ENV_FILE          Default ~/zeugnio/shared/.env
//   BACKUP_DIR        Default ~/zeugnio/backups
//   BACKUP_KEY_FILE   Default ~/zeugnio/shared/backup.key  (erzeugen: openssl rand -base64 48)
//   BACKUP_KEEP_DAYS  Default 14 (gilt nur lokal; im Object Storage regelt es die Lifecycle-Regel)
//   DUMP_BIN          Pfad zu pg_dump, falls nicht im PATH
//
// Entschluesseln (Schluessel aus dem Passwort-Manager, falls der Server weg ist):
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:backup.key -in DATEI.enc | gunzip > auszug.sql
//
// WICHTIG BEIM ZURUECKSPIELEN: Der Auszug enthaelt Eigentuemer und Rechte. Das ist Absicht -
// die Tabellen gehoeren service_role, und nur darueber umgeht die Anwendung die
// Zeilensicherheit. Ein Auszug mit --no-owner waere unbrauchbar: die Anwendung wuerde nach dem
// Zurueckspielen leere Ergebnisse liefern, ohne einen einzigen Fehler zu melden. Vor dem
// Zurueckspielen in eine leere Datenbank darum zuerst supabase/900_nine_bootstrap.sql
// einspielen, damit die Rollen existieren.
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

const home = os.homedir();
const envFile = process.env.ENV_FILE ?? path.join(home, "zeugnio", "shared", ".env");
const backupDir = process.env.BACKUP_DIR ?? path.join(home, "zeugnio", "backups");
const keyFile = process.env.BACKUP_KEY_FILE ?? path.join(home, "zeugnio", "shared", "backup.key");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
const OPENSSL_ARGS = ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt"];
// Grenze fuer den Upload: darueber braeuchte es mehrteiliges Hochladen. Lieber ein klarer
// Abbruch als eine halb uebertragene Sicherung, die niemandem auffaellt.
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const journalOnly = args.has("--journal-only");
const forceFull = args.has("--full");
for (const arg of args) {
  if (!["--journal-only", "--full"].includes(arg)) {
    console.error(`[backup] Unbekannte Option: ${arg}`);
    process.exit(2);
  }
}

function fail(message) {
  console.error(`[backup] Fehler: ${message}`);
  process.exit(1);
}

if (!Number.isInteger(keepDays) || keepDays < 1) fail("BACKUP_KEEP_DAYS muss eine ganze Zahl ab 1 sein.");

// Alle erzeugten Dateien nur fuer den eigenen Benutzer lesbar.
process.umask(0o077);

try {
  process.loadEnvFile(envFile);
} catch {
  fail(`${envFile} nicht lesbar.`);
}

let url;
try {
  url = new URL(process.env.DATABASE_URL ?? "");
} catch {
  fail("DATABASE_URL fehlt oder ist ungueltig.");
}

try {
  const mode = statSync(keyFile).mode;
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    fail(`${keyFile} ist fuer andere lesbar - bitte chmod 600.`);
  }
} catch (error) {
  if (error.code === "ENOENT") {
    fail(`Schluesseldatei ${keyFile} fehlt. Erzeugen mit: openssl rand -base64 48 > ${keyFile}`);
  }
  throw error;
}

const pgEnv = {
  ...process.env,
  PGHOST: url.hostname || "127.0.0.1",
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGCONNECT_TIMEOUT: "10",
  LC_MESSAGES: "C",
};

const uploadDir = process.env.ZEUGNIO_UPLOAD_DIR ?? path.join(home, "zeugnio", "shared", "uploads");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

mkdirSync(backupDir, { recursive: true });

function waitForExit(child, name) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`${name} nicht startbar: ${error.message}`)));
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`${name} beendet mit Code ${code}`))));
  });
}

/** Startet `producer` (ein Kindprozess mit Ausgabe auf stdout), komprimiert und
 *  verschluesselt den Strom nach `finalFile`. Unfertiges bekommt nie den endgueltigen Namen. */
async function writeEncrypted(finalFile, producerBin, producerArgs, producerEnv, minBytes) {
  const partFile = `${finalFile}.part`;
  try {
    const producer = spawn(producerBin, producerArgs, { env: producerEnv, stdio: ["ignore", "pipe", "inherit"] });
    const encrypt = spawn("openssl", [...OPENSSL_ARGS, "-pass", `file:${keyFile}`, "-out", partFile], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    await Promise.all([
      pipeline(producer.stdout, zlib.createGzip({ level: 9 }), encrypt.stdin),
      waitForExit(producer, path.basename(producerBin)),
      waitForExit(encrypt, "openssl"),
    ]);
    if (statSync(partFile).size < minBytes) {
      throw new Error(`Ergebnis ist verdaechtig klein (unter ${minBytes} Bytes) - nicht gespeichert.`);
    }
    renameSync(partFile, finalFile);
    return finalFile;
  } catch (error) {
    rmSync(partFile, { force: true });
    throw error;
  }
}

const produced = [];

// --- 1) Datenbank-Auszug ----------------------------------------------------------------
if (!journalOnly) {
  const dumpBin = process.env.DUMP_BIN ?? "pg_dump";
  // Ohne --no-owner und ohne --no-privileges: siehe Kopf dieser Datei. Die
  // Eigentumsverhaeltnisse sind hier Teil des Sicherheitsmodells, nicht Beiwerk.
  const dumpArgs = ["--clean", "--if-exists", "--quote-all-identifiers", pgEnv.PGDATABASE];
  const file = path.join(backupDir, `zeugnio-${stamp}.pg.sql.gz.enc`);
  try {
    produced.push(await writeEncrypted(file, dumpBin, dumpArgs, pgEnv, 1024));
  } catch (error) {
    fail(error.message);
  }
}

// --- 2) Zeugnis-Journal ------------------------------------------------------------------
// Klein genug, um es haeufig zu schreiben: eine Zeile pro ausgestelltem Zeugnis mit genau den
// Feldern, an denen die Echtheitspruefung haengt. Damit ist nach einem Rueckspielen
// belegbar, WELCHE Zeugnisse es gab - die Zeugnisse selbst holt das nicht zurueck, dafuer
// braucht es den Auszug. Der Nutzen ist die Liste, an der man merkt, dass etwas fehlt.
{
  // Spaltennamen gegen supabase/024_hash_version_meta.sql und 025_certificate_signature.sql
  // geprueft: hash_version, signature, signing_key_id (nicht signature_key_id).
  const copySql =
    "copy (select id, hash, hash_version, signature, signing_key_id, status, " +
    "finalized_at, revoked_at from public.certificates " +
    "where status in ('final','revoked') order by finalized_at nulls last, id) " +
    "to stdout with (format csv, header true)";
  const file = path.join(backupDir, `zeugnio-${stamp}.journal.csv.gz.enc`);
  try {
    // Mindestgroesse 1 Byte: eine leere Datenbank ergibt nur die Kopfzeile, und das ist
    // ein gueltiges Journal.
    produced.push(await writeEncrypted(file, "psql", ["-w", "-X", "-q", "-A", "-t", "-c", copySql], pgEnv, 1));
  } catch (error) {
    // Ein fehlendes Journal darf den Auszug nicht wegwerfen, aber es muss auffallen.
    console.error(`[backup] Journal fehlgeschlagen: ${error.message}`);
    console.error("[backup] Stimmen die Spaltennamen noch? Dann hier nachziehen.");
    process.exitCode = 1;
  }
}

// --- 3) Firmenlogos ----------------------------------------------------------------------
function newestMtime(dir) {
  let newest = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, statSync(full).mtimeMs);
    }
  };
  try {
    walk(dir);
  } catch {
    return 0;
  }
  return newest;
}

function newestArchive(pattern) {
  let newest = 0;
  for (const name of readdirSync(backupDir)) {
    if (!pattern.test(name)) continue;
    newest = Math.max(newest, statSync(path.join(backupDir, name)).mtimeMs);
  }
  return newest;
}

if (!journalOnly) {
  const changed = newestMtime(uploadDir) > newestArchive(/^zeugnio-.+\.uploads\.tar\.gz\.enc$/);
  if (forceFull || changed) {
    const file = path.join(backupDir, `zeugnio-${stamp}.uploads.tar.gz.enc`);
    try {
      // tar schreibt auf stdout, gzip und openssl kommen wie beim Auszug dahinter.
      produced.push(
        await writeEncrypted(file, "tar", ["-cf", "-", "-C", path.dirname(uploadDir), path.basename(uploadDir)], process.env, 1),
      );
    } catch (error) {
      console.error(`[backup] Logo-Archiv fehlgeschlagen: ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    console.log("[backup] Logos unveraendert - kein neues Archiv.");
  }
}

for (const file of produced) {
  console.log(`[backup] ${new Date().toISOString()} ${path.basename(file)} (${Math.round(statSync(file).size / 1024)} KB)`);
}

// --- 4) Kopie ins zweite Rechenzentrum (S3-kompatibler Object Storage bei nine) ----------
// Bewusst ohne zusaetzliche Abhaengigkeit: die Unterschrift nach AWS SigV4 sind rund vierzig
// Zeilen, und ein SDK im Sicherungspfad ist eine Abhaengigkeit, die genau dann fehlt, wenn
// man sie braucht.
function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

async function putObject({ endpoint, bucket, accessKey, secretKey, key, body }) {
  const base = new URL(endpoint);
  // Pfad-Stil (endpoint/bucket/key) - mit nines Object Storage der zuverlaessige Weg.
  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const targetUrl = new URL(canonicalUri, base);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = process.env.S3_REGION ?? "us-east-1";
  const service = "s3";
  const payloadHash = sha256Hex(body);

  const headers = {
    host: targetUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");

  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  let signingKey = hmac(`AWS4${secretKey}`, dateStamp);
  for (const part of [region, service, "aws4_request"]) signingKey = hmac(signingKey, part);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const response = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Length": String(body.length),
      "Content-Type": "application/octet-stream",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`);
  }
}

const s3 = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY_ID,
  secretKey: process.env.S3_SECRET_ACCESS_KEY,
};

if (produced.length > 0) {
  if (!s3.endpoint || !s3.bucket || !s3.accessKey || !s3.secretKey) {
    console.error(
      "[backup] Kein Object Storage konfiguriert (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, " +
        "S3_SECRET_ACCESS_KEY). Die Sicherung liegt damit im selben Rechenzentrum wie die " +
        "Datenbank - im Ernstfall ist das keine Sicherung.",
    );
    process.exitCode = 1;
  } else {
    for (const file of produced) {
      const size = statSync(file).size;
      if (size > MAX_UPLOAD_BYTES) {
        console.error(
          `[backup] ${path.basename(file)} ist ${Math.round(size / 1024 / 1024)} MB und damit zu ` +
            "gross fuer das einteilige Hochladen. Bitte von Hand kopieren und den Ablauf anpassen.",
        );
        process.exitCode = 1;
        continue;
      }
      try {
        await putObject({ ...s3, key: `zeugnio/${path.basename(file)}`, body: readFileSync(file) });
        console.log(`[backup] kopiert nach ${s3.bucket}/zeugnio/${path.basename(file)}`);
      } catch (error) {
        console.error(`[backup] Kopie nach ${s3.bucket} fehlgeschlagen: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}

// --- 5) Lokal aufraeumen -----------------------------------------------------------------
// Nur eigene, fertige Dateien. Im Object Storage wird NICHT geloescht - dort regelt das eine
// Lifecycle-Regel, damit ein Fehler in diesem Skript nie die Kopie im zweiten Rechenzentrum
// mitnimmt.
const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
for (const name of readdirSync(backupDir)) {
  if (!/^zeugnio-.+\.enc(\.part)?$/.test(name)) continue;
  const file = path.join(backupDir, name);
  if (statSync(file).mtimeMs < cutoff) {
    rmSync(file);
    console.log(`[backup] entfernt: ${name}`);
  }
}

// Ein stiller Fehlschlag ist bei einer Sicherung der schlimmste Fall: der Cron soll ihn sehen.
if (process.exitCode) {
  console.error("[backup] Mit Fehlern beendet - bitte nachsehen.");
}
