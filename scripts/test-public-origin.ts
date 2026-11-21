/**
 * Test der Adresse für Weiterleitungen in der Middleware (lib/public-origin.ts).
 *
 *   npm run test:public-origin
 *
 * Anlass: Hinter nginx auf advisori01 leitete die Middleware nach
 * https://localhost:3010/login um (gemessen 12.11.2026 auf test.zeugnio.ch).
 */
import assert from "node:assert/strict";
import { legacyHostRedirect, resolvePublicOrigin, type OriginInput } from "../lib/public-origin";

const base: OriginInput = {
  hostname: "localhost",
  origin: "https://localhost:3010",
  protocol: "https:",
  forwardedHost: null,
  forwardedProto: null,
  siteUrl: "https://zeugnio.ch",
  production: true,
};

let n = 0;
function check(name: string, input: Partial<OriginInput>, expected: string) {
  assert.equal(resolvePublicOrigin({ ...base, ...input }), expected, name);
  n++;
  console.log(`  ok  ${name}`);
}

check("Vercel: echter Host bleibt", { hostname: "www.zeugnio.ch", origin: "https://www.zeugnio.ch" }, "https://www.zeugnio.ch");
check("Vercel: fremder X-Forwarded-Host wird ignoriert", { hostname: "www.zeugnio.ch", origin: "https://www.zeugnio.ch", forwardedHost: "boese.example" }, "https://www.zeugnio.ch");
check("nine mit X-Forwarded-Host", { forwardedHost: "test.zeugnio.ch", forwardedProto: "https" }, "https://test.zeugnio.ch");
check("nine: erster Eintrag einer Liste", { forwardedHost: "test.zeugnio.ch, localhost:3010", forwardedProto: "https,http" }, "https://test.zeugnio.ch");
check("nine ohne X-Forwarded-Host: NEXT_PUBLIC_SITE_URL", {}, "https://zeugnio.ch");
check("ungültiger X-Forwarded-Host fällt auf SITE_URL", { forwardedHost: "evil.example/login?x=" }, "https://zeugnio.ch");
check("Entwicklung auf localhost bleibt lokal", { production: false, origin: "http://localhost:3000", protocol: "http:" }, "http://localhost:3000");
check("ungültige SITE_URL fällt auf die Anfrage zurück", { siteUrl: "kein url" }, "https://localhost:3010");
check("127.0.0.1 gilt als Loopback", { hostname: "127.0.0.1", origin: "https://127.0.0.1:3010" }, "https://zeugnio.ch");

// Altdomain zeugnix.ch (Schritt 6.4)
function legacy(name: string, origin: string, path: string, expected: string | null) {
  assert.equal(legacyHostRedirect(origin, path), expected, name);
  n++;
  console.log(`  ok  ${name}`);
}
legacy("zeugnix.ch mit Pfad und Query", "https://zeugnix.ch", "/verify/abc?x=1", "https://zeugnio.ch/verify/abc?x=1");
legacy("www.zeugnix.ch", "https://www.zeugnix.ch", "/", "https://zeugnio.ch/");
legacy("Grossschreibung im Host", "https://WWW.Zeugnix.CH", "/login", "https://zeugnio.ch/login");
legacy("über nine (X-Forwarded-Host)", resolvePublicOrigin({ ...base, forwardedHost: "zeugnix.ch", forwardedProto: "https" }), "/a", "https://zeugnio.ch/a");
legacy("zeugnio.ch bleibt", "https://zeugnio.ch", "/", null);
legacy("www.zeugnio.ch bleibt", "https://www.zeugnio.ch", "/", null);
legacy("ähnlicher Host bleibt", "https://zeugnix.ch.example", "/", null);
legacy("Pfad mit // lenkt nicht auf fremden Host", "https://zeugnix.ch", "//boese.example/x", "https://zeugnio.ch/x");
legacy("localhost bleibt", "http://localhost:3000", "/", null);

console.log(`\n${n} Prüfungen bestanden.`);
