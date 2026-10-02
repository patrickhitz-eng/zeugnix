/**
 * Verhindert, dass eine Seite mit CSP-Nonce statisch vorgerendert wird.
 *
 * DER FEHLER, DEN DIESES SKRIPT UNMÖGLICH MACHT
 *
 * Die Middleware vergibt für bestimmte Pfade eine Nonce und setzt dazu
 * 'strict-dynamic'. Der Browser ignoriert dann 'self' für Skripte: erlaubt ist
 * nur noch, was die Nonce trägt. Eine Nonce entsteht pro Anfrage – in eine
 * Seite, die beim Build fertig gerendert wurde, kann sie nicht mehr gelangen.
 * Folge: der Browser blockiert das gesamte JavaScript dieser Seite.
 *
 * Das fällt nicht auf. Die Seite lädt, sieht richtig aus und reagiert auf
 * nichts. Bei /auth/callback hiess das: der Magic-Link wurde nie gegen eine
 * Sitzung getauscht, und die Anmeldung schlug mit einer Meldung fehl, die auf
 * Supabase zeigte.
 *
 * Der Hinweis stand bisher als Kommentar in middleware.ts. Ein Kommentar hält
 * niemanden auf; dieses Skript tut es.
 *
 * Läuft als `postbuild`, weil erst der Build weiss, welche Route statisch
 * wurde. Quelle ist .next/prerender-manifest.json – dieselbe Information wie
 * das ○/ƒ in der Build-Ausgabe, nur maschinenlesbar.
 */
import { readFileSync } from "node:fs";

const MIDDLEWARE = "middleware.ts";
const MANIFEST = ".next/prerender-manifest.json";

function fail(text) {
  console.error(`\n  FEHLER  ${text}\n`);
  process.exit(1);
}

// Die Präfixe werden aus middleware.ts gelesen und nicht hier wiederholt.
// Zwei Listen, die dasselbe bedeuten, laufen irgendwann auseinander – und dann
// prüft dieses Skript etwas anderes als das, was in Produktion gilt.
let prefixe;
try {
  const quelle = readFileSync(MIDDLEWARE, "utf8");
  const treffer = quelle.match(/const NONCE_PREFIXES\s*=\s*\[([^\]]*)\]/);
  if (!treffer) {
    fail(
      `In ${MIDDLEWARE} ist NONCE_PREFIXES nicht mehr zu finden. Wurde es ` +
        `umbenannt oder verschoben, prüft dieses Skript nichts mehr – darum ` +
        `bricht es hier ab statt stillschweigend durchzulassen.`,
    );
  }
  prefixe = [...treffer[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (prefixe.length === 0) fail(`NONCE_PREFIXES in ${MIDDLEWARE} ist leer.`);
} catch (error) {
  fail(`${MIDDLEWARE} ist nicht lesbar: ${error.message}`);
}

let statisch;
try {
  statisch = Object.keys(JSON.parse(readFileSync(MANIFEST, "utf8")).routes ?? {});
} catch (error) {
  fail(
    `${MANIFEST} ist nicht lesbar (${error.message}). Dieses Skript gehört ` +
      `hinter den Build, nicht davor.`,
  );
}

const betroffen = statisch.filter((route) =>
  prefixe.some((p) => route === p || route.startsWith(`${p}/`)),
);

if (betroffen.length > 0) {
  fail(
    `Diese Routen bekommen von der Middleware eine CSP-Nonce, wurden aber ` +
      `statisch vorgerendert:\n\n` +
      betroffen.map((r) => `            ${r}`).join("\n") +
      `\n\n          Im Browser ist dort das gesamte JavaScript blockiert.\n` +
      `          Behebung: in der page.tsx der Route\n\n` +
      `            export const dynamic = "force-dynamic";\n\n` +
      `          ergänzen. Ist es eine Client Component ("use client"), gehört ` +
      `die Zeile\n          in eine page.tsx daneben, die den Browser-Teil nur ` +
      `einbindet – Route-\n          Segment-Konfiguration wirkt in Client ` +
      `Components nicht. Beispiel:\n          app/auth/callback/page.tsx.\n\n` +
      `          Alternativ den Pfad aus NONCE_PREFIXES in ${MIDDLEWARE} ` +
      `nehmen. Dann gilt\n          dort die schwächere Policy mit ` +
      `'unsafe-inline' – für eine Seite, die\n          Anmeldedaten ` +
      `verarbeitet, ist das die schlechtere Wahl.`,
  );
}

console.log(
  `  ✓ Nonce-Routen: keine der ${prefixe.length} Pfadgruppen (${prefixe.join(", ")}) ` +
    `ist statisch vorgerendert (${statisch.length} statische Routen geprüft)`,
);
