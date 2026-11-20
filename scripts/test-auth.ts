/**
 * Tests für die eigene Anmeldung (Cutover B) — lib/auth/*.
 *
 * Ausführen:
 *   npm run test:auth   (läuft auch im prebuild mit)
 *
 * Geprüft wird alles, was ohne Datenbank geht. Das Verhalten in der Datenbank
 * (Link zweimal einlösen, fünf Fehlversuche, abgelaufene Anforderung, Rechte)
 * prüft supabase/907_auth_eigen_verify.sql (`npm run test:auth-db` gegen eine
 * Wegwerf-Datenbank mit 900–906).
 *
 * Zum Vergleich in konstanter Zeit (timingSafeEqual): Die Anwendung vergleicht
 * Codes und Tokens nicht selbst. Sie schickt HMAC-Werte an die Datenbank, und
 * dort wird HMAC gegen HMAC verglichen. Ein Zeitunterschied verriete nur etwas
 * über einen HMAC-Wert, aus dem sich ohne Geheimnis kein Code zurückrechnen
 * lässt. Darum gibt es hier keinen eigenen Vergleich, den man testen müsste;
 * geprüft wird stattdessen, dass nie ein Klartext die Anwendung Richtung
 * Datenbank verlässt.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { ANFORDERN_OK, handleAnfordern, type AnfordernDeps } from "../lib/auth/anfordern";
import {
  authMode,
  authSecret,
  LOGIN_MAX_TRIES,
  LOGIN_TTL_MINUTES,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  siteOrigin,
} from "../lib/auth/config";
import { clearedSessionCookie, sessionCookie } from "../lib/auth/cookie";
import { allowedOrigins, isAllowedOrigin } from "../lib/auth/origin";
import { sanitizeNext } from "../lib/auth/sanitize-next";
import { codeHmac, hmac, isCodeShape, isTokenShape, newCode, newToken, normalizeEmail } from "../lib/auth/tokens";

let passed = 0;
let failed = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `erwartet ${e}, war ${a}`);
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const SECRET = "test-geheimnis-".padEnd(48, "x");
const OTHER = "anderes-geheimnis-".padEnd(48, "y");

async function main() {
  // ------------------------------------------------------------------------
  console.log("\nHMAC");
  const token = newToken();
  const h1 = hmac(SECRET, "link", token);
  eq("deterministisch", hmac(SECRET, "link", token), h1);
  ok("hängt vom Geheimnis ab", hmac(OTHER, "link", token) !== h1);
  ok("hängt vom Zweck ab (Link ≠ Sitzung)", hmac(SECRET, "session", token) !== h1);
  ok("64 Hex-Zeichen", /^[0-9a-f]{64}$/.test(h1));
  ok("Klartext steckt nicht im HMAC", !h1.includes(token));
  ok("ohne Geheimnis: Fehler statt einfacher Hash", throws(() => hmac("", "link", token)));
  const c = "004711";
  ok("Code-HMAC an die Adresse gebunden", codeHmac(SECRET, "a@firma.ch", c) !== codeHmac(SECRET, "b@firma.ch", c));
  eq(
    "Code-HMAC: Gross-/Kleinschreibung der Adresse egal",
    codeHmac(SECRET, " Anna@Firma.CH ", c),
    codeHmac(SECRET, "anna@firma.ch", c),
  );
  ok("Code-HMAC enthält den Code nicht", !codeHmac(SECRET, "a@firma.ch", c).includes(c));

  // ------------------------------------------------------------------------
  console.log("\nZufallswerte");
  let allSix = true;
  let leadingZero = false;
  const seen = new Set<string>();
  for (let i = 0; i < 20000; i++) {
    const code = newCode();
    if (!/^\d{6}$/.test(code)) allSix = false;
    if (code.startsWith("0")) leadingZero = true;
    seen.add(code);
  }
  ok("Code hat immer genau 6 Ziffern", allSix);
  ok("führende Nullen kommen vor (gleichverteilt, nicht abgeschnitten)", leadingZero);
  ok("Codes streuen (> 19 000 verschiedene aus 20 000)", seen.size > 19000, `${seen.size}`);
  ok("Token hat 43 Zeichen base64url", isTokenShape(newToken()));
  ok("zwei Tokens sind verschieden", newToken() !== newToken());
  ok("isTokenShape lehnt Fremdes ab", !isTokenShape("abc") && !isTokenShape(`${"a".repeat(42)}=`) && !isTokenShape(undefined));
  ok("isCodeShape lehnt 5 und 7 Stellen ab", !isCodeShape("12345") && !isCodeShape("1234567") && isCodeShape("000000"));
  eq("Adresse normalisiert", normalizeEmail("  Anna.Muster@Firma.CH "), "anna.muster@firma.ch");

  // ------------------------------------------------------------------------
  console.log("\nCookie");
  const spec = sessionCookie(token);
  ok("Name mit Präfix __Host-", spec.name.startsWith("__Host-") && spec.name === SESSION_COOKIE);
  ok("HttpOnly", spec.options.httpOnly === true);
  ok("Secure", spec.options.secure === true);
  eq("SameSite=Lax", spec.options.sameSite, "lax");
  eq("Path=/", spec.options.path, "/");
  ok("kein Domain-Attribut (Pflicht für __Host-)", !("domain" in spec.options));
  eq("Max-Age 30 Tage", spec.options.maxAge, 30 * 24 * 60 * 60);
  eq("Löschen: Max-Age 0, leerer Wert", [clearedSessionCookie().options.maxAge, clearedSessionCookie().value], [0, ""]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(spec.name, spec.value, spec.options);
  const header = res.headers.get("set-cookie") ?? "";
  ok("Set-Cookie trägt HttpOnly", /;\s*HttpOnly/i.test(header), header);
  ok("Set-Cookie trägt Secure", /;\s*Secure/i.test(header), header);
  ok("Set-Cookie trägt SameSite=Lax", /;\s*SameSite=Lax/i.test(header), header);
  ok("Set-Cookie trägt Path=/", /;\s*Path=\//i.test(header), header);
  ok("Set-Cookie ohne Domain", !/;\s*Domain=/i.test(header), header);

  // ------------------------------------------------------------------------
  console.log("\nAnfordern: gleiche Antwort für jede Adresse");
  const KNOWN = "bekannt@firma.ch";

  function deps(over: Partial<AnfordernDeps> = {}) {
    const stored: { email: string; linkHmac: string; codeHmac: string }[] = [];
    const scheduled: (() => Promise<void>)[] = [];
    const mails: { to: string; linkUrl: string; code: string }[] = [];
    const d: AnfordernDeps = {
      secret: SECRET,
      signupOpen: false,
      siteOrigin: "https://zeugnio.ch",
      clientIp: "203.0.113.7",
      rateLimit: async () => true,
      // Wie auth_request_login: bei geschlossener Registrierung nur bekannte Adressen.
      storeRequest: async (input) => {
        if (!input.signupOpen && input.email !== KNOWN) return false;
        stored.push(input);
        return true;
      },
      sendLoginMail: async (mail) => {
        mails.push(mail);
      },
      schedule: (task) => {
        scheduled.push(task);
      },
      ...over,
    };
    return { d, stored, scheduled, mails };
  }

  const known = deps();
  const unknown = deps();
  const rKnown = await handleAnfordern({ email: "Bekannt@Firma.ch", next: "/app/dashboard" }, known.d);
  const rUnknown = await handleAnfordern({ email: "unbekannt@firma.ch", next: "/app/dashboard" }, unknown.d);
  eq("Status gleich", rKnown.status, rUnknown.status);
  eq("Rumpf gleich", rKnown.body, rUnknown.body);
  eq("Rumpf ist die eine OK-Antwort", rKnown.body, ANFORDERN_OK.body);
  ok("Mail erst nach der Antwort (geplant, nicht abgewartet)", known.scheduled.length === 1 && known.mails.length === 0);
  ok("unbekannte Adresse: keine Mail geplant", unknown.scheduled.length === 0);

  await known.scheduled[0]();
  const mail = known.mails[0];
  ok("Mail geht an die normalisierte Adresse", mail?.to === KNOWN);
  ok("Link zeigt auf die feste Adresse, nicht auf die Anfrage", mail?.linkUrl.startsWith("https://zeugnio.ch/auth/link?t="));
  const linkToken = new URL(mail.linkUrl).searchParams.get("t") ?? "";
  ok("Link-Token hat Token-Form", isTokenShape(linkToken));
  eq("next reist im Link mit", new URL(mail.linkUrl).searchParams.get("next"), "/app/dashboard");
  const row = known.stored[0];
  ok("gespeichert wird der HMAC des Links", row.linkHmac === hmac(SECRET, "link", linkToken));
  ok("gespeichert wird der HMAC des Codes", row.codeHmac === codeHmac(SECRET, KNOWN, mail.code));
  ok(
    "kein Klartext von Link oder Code Richtung Datenbank",
    !JSON.stringify(row).includes(linkToken) && !JSON.stringify(row).includes(mail.code),
  );

  const openKnown = deps({ signupOpen: true });
  const openUnknown = deps({ signupOpen: true });
  const oK = await handleAnfordern({ email: KNOWN, next: "" }, openKnown.d);
  const oU = await handleAnfordern({ email: "neu@firma.ch", next: "" }, openUnknown.d);
  eq("offene Registrierung: Antwort ebenfalls gleich", [oK.status, oK.body], [oU.status, oU.body]);
  ok("offene Registrierung: auch neue Adresse bekommt Mail", openUnknown.scheduled.length === 1);

  const limited = deps({ rateLimit: async (_key, kind) => kind !== "adresse" });
  const rLimited = await handleAnfordern({ email: KNOWN, next: "" }, limited.d);
  eq("Ratenbegrenzung pro Adresse: 429", rLimited.status, 429);
  ok("Ratenbegrenzung: nichts gespeichert, keine Mail", limited.stored.length === 0 && limited.scheduled.length === 0);
  const keys: string[] = [];
  await handleAnfordern({ email: KNOWN, next: "" }, deps({ rateLimit: async (key) => (keys.push(key), true) }).d);
  ok("Zähler-Schlüssel ohne Adresse im Klartext", keys.length === 2 && keys.every((k) => !k.includes("firma.ch")), keys.join(" | "));
  ok("Zähler-Schlüssel pro IP nutzt die übergebene IP", keys.some((k) => k === "auth:anfordern:ip:203.0.113.7"));
  eq("ungültige Adresse: 400", (await handleAnfordern({ email: "kein-at", next: "" }, deps().d)).status, 400);

  // ------------------------------------------------------------------------
  console.log("\nHerkunft (Origin)");
  const allowedProd = allowedOrigins({ siteOrigin: "https://zeugnio.ch", requestOrigin: "http://localhost:3010", production: true });
  ok("eigene Adresse erlaubt", isAllowedOrigin("https://zeugnio.ch", allowedProd));
  ok("fremde Adresse abgelehnt", !isAllowedOrigin("https://boese.example", allowedProd));
  ok("fehlender Origin abgelehnt", !isAllowedOrigin(null, allowedProd) && !isAllowedOrigin(undefined, allowedProd));
  ok("Origin «null» abgelehnt", !isAllowedOrigin("null", allowedProd));
  ok("Subdomain abgelehnt", !isAllowedOrigin("https://test.zeugnio.ch", allowedProd));
  ok("http statt https abgelehnt", !isAllowedOrigin("http://zeugnio.ch", allowedProd));
  ok("Origin mit Pfad abgelehnt", !isAllowedOrigin("https://zeugnio.ch/x", allowedProd));
  ok("Produktion: Herkunft der Anfrage zählt nicht", !isAllowedOrigin("http://localhost:3010", allowedProd));
  const allowedDev = allowedOrigins({ siteOrigin: "https://zeugnio.ch", requestOrigin: "http://localhost:3000", production: false });
  ok("Entwicklung: Dev-Server erlaubt", isAllowedOrigin("http://localhost:3000", allowedDev));

  // ------------------------------------------------------------------------
  console.log("\nnext-Ziel (Open Redirect)");
  eq("normaler Pfad bleibt", sanitizeNext("/app/company"), "/app/company");
  eq("//fremd abgelehnt", sanitizeNext("//boese.example"), "/app/dashboard");
  eq("/\\fremd abgelehnt", sanitizeNext("/\\boese.example"), "/app/dashboard");
  eq("Steuerzeichen abgelehnt", sanitizeNext("/app\n/x"), "/app/dashboard");
  eq("absolute Adresse abgelehnt", sanitizeNext("https://boese.example"), "/app/dashboard");

  // ------------------------------------------------------------------------
  console.log("\nSchalter und Konfiguration");
  const saved = { mode: process.env.ZEUGNIO_AUTH, secret: process.env.ZEUGNIO_AUTH_SECRET, site: process.env.NEXT_PUBLIC_SITE_URL };
  delete process.env.ZEUGNIO_AUTH;
  eq("ohne Variable: supabase", authMode(), "supabase");
  process.env.ZEUGNIO_AUTH = " Eigen ";
  eq("«Eigen» mit Leerzeichen: eigen", authMode(), "eigen");
  process.env.ZEUGNIO_AUTH = "eigne";
  eq("Tippfehler: supabase (sicherer Rückfall)", authMode(), "supabase");
  process.env.ZEUGNIO_AUTH_SECRET = "zu-kurz";
  ok("zu kurzes Geheimnis: Fehler", throws(() => authSecret()));
  delete process.env.ZEUGNIO_AUTH_SECRET;
  ok("fehlendes Geheimnis: Fehler", throws(() => authSecret()));
  process.env.NEXT_PUBLIC_SITE_URL = "https://test.zeugnio.ch/";
  eq("siteOrigin aus NEXT_PUBLIC_SITE_URL, ohne Schrägstrich", siteOrigin(), "https://test.zeugnio.ch");
  for (const [k, v] of [["ZEUGNIO_AUTH", saved.mode], ["ZEUGNIO_AUTH_SECRET", saved.secret], ["NEXT_PUBLIC_SITE_URL", saved.site]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const sql = readFileSync(path.join(__dirname, "..", "supabase", "906_auth_eigen.sql"), "utf8");
  ok(`Login-Gültigkeit ${LOGIN_TTL_MINUTES} min wie in 906`, sql.includes(`interval '${LOGIN_TTL_MINUTES} minutes'`));
  ok(`höchstens ${LOGIN_MAX_TRIES} Versuche wie in 906`, sql.includes(`login_max_tries() returns integer  language sql immutable as $$ select ${LOGIN_MAX_TRIES} $$`));
  ok("Sitzung 30 Tage wie in 906", SESSION_TTL_SECONDS === 30 * 86400 && sql.includes("interval '30 days'"));

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
