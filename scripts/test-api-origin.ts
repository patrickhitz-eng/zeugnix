/**
 * Test der zentralen Herkunftsprüfung für schreibende API-Anfragen
 * (lib/api-origin.ts, aufgerufen in middleware.ts).
 *
 *   npm run test:api-origin
 */
import assert from "node:assert/strict";
import { judgeOrigin, needsOriginCheck } from "../lib/api-origin";
import { allowedOrigins } from "../lib/auth/origin";

let n = 0;
function ok(name: string, value: boolean) {
  assert.ok(value, name);
  n++;
  console.log(`  ok  ${name}`);
}

console.log("Welche Anfragen werden geprüft");
ok("POST unter /api wird geprüft", needsOriginCheck("POST", "/api/team/invitations"));
ok("PUT, PATCH, DELETE werden geprüft", ["PUT", "PATCH", "DELETE"].every((m) => needsOriginCheck(m, "/api/certificates/x")));
ok("Methode klein geschrieben wird geprüft", needsOriginCheck("post", "/api/companies"));
ok("öffentliche Prüfung wird geprüft", needsOriginCheck("POST", "/api/verify") && needsOriginCheck("POST", "/api/verify/hash") && needsOriginCheck("POST", "/api/analyze"));
ok("Token-Routen werden geprüft", needsOriginCheck("POST", "/api/signoffs/abc/submit") && needsOriginCheck("POST", "/api/evaluations/submit"));
ok("Anmelde-Routen werden (zusätzlich) geprüft", needsOriginCheck("POST", "/api/auth/code"));
ok("GET, HEAD, OPTIONS nicht", !needsOriginCheck("GET", "/api/companies") && !needsOriginCheck("HEAD", "/api/health") && !needsOriginCheck("OPTIONS", "/api/verify"));
ok("Seiten ausserhalb /api nicht", !needsOriginCheck("POST", "/app/certificates") && !needsOriginCheck("POST", "/apix"));
ok("Ausnahme Cron", !needsOriginCheck("POST", "/api/cron/pii-cleanup"));
ok("Ausnahme Stripe-Webhook", !needsOriginCheck("POST", "/api/stripe/webhook"));
ok("Stripe-Checkout ist keine Ausnahme", needsOriginCheck("POST", "/api/stripe/checkout"));
ok("Präfix-Trick «webhookX» ist keine Ausnahme", needsOriginCheck("POST", "/api/stripe/webhookX"));
ok("Präfix-Trick «/api/cronjob» ist keine Ausnahme", needsOriginCheck("POST", "/api/cronjob"));

console.log("Herkunft in Produktion");
const prod = allowedOrigins({ siteOrigin: "https://zeugnio.ch", requestOrigin: "http://localhost:3010", production: true });
const j = (origin: string | null, referer: string | null = null) => judgeOrigin({ origin, referer, allowed: prod });
ok("eigener Origin erlaubt", j("https://zeugnio.ch") === "ok");
ok("fremder Origin abgewiesen", j("https://boese.example") === "fremd");
ok("Subdomain abgewiesen", j("https://test.zeugnio.ch") === "fremd");
ok("Altdomain abgewiesen", j("https://zeugnix.ch") === "fremd");
ok("http statt https abgewiesen", j("http://zeugnio.ch") === "fremd");
ok("Origin «null» abgewiesen", j("null") === "fremd");
ok("Origin «null» mit eigenem Referer bleibt abgewiesen", j("null", "https://zeugnio.ch/verify") === "fremd");
ok("fremder Origin, eigener Referer: Origin entscheidet", j("https://boese.example", "https://zeugnio.ch/") === "fremd");
ok("ohne Origin: eigener Referer erlaubt", j(null, "https://zeugnio.ch/app/certificates/1") === "ok");
ok("ohne Origin: fremder Referer abgewiesen", j(null, "https://boese.example/zeugnio.ch") === "fremd");
ok("ohne Origin: Referer mit Zugangsdaten-Trick abgewiesen", j(null, "https://zeugnio.ch@boese.example/") === "fremd");
ok("ohne Origin: kaputter Referer abgewiesen", j(null, "kein url") === "fremd");
ok("ohne Origin und Referer: fehlt", j(null, null) === "fehlt");
ok("ohne Origin, leerer Referer: fehlt", j(null, "") === "fehlt");
ok("Produktion: Dev-Adresse zählt nicht", j("http://localhost:3010") === "fremd");

console.log("Herkunft in der Entwicklung");
const dev = allowedOrigins({ siteOrigin: "https://zeugnio.ch", requestOrigin: "http://localhost:3000", production: false });
ok("Dev-Server erlaubt", judgeOrigin({ origin: "http://localhost:3000", referer: null, allowed: dev }) === "ok");
ok("anderer Port abgewiesen", judgeOrigin({ origin: "http://localhost:4000", referer: null, allowed: dev }) === "fremd");

console.log(`\n${n} Prüfungen ok`);
