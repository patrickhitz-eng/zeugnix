/**
 * Test der Adresse für Weiterleitungen in der Middleware (lib/public-origin.ts).
 *
 *   npm run test:public-origin
 *
 * Anlass: Hinter nginx auf advisori01 leitete die Middleware nach
 * https://localhost:3010/login um (gemessen 12.11.2026 auf test.zeugnio.ch).
 */
import assert from "node:assert/strict";
import { resolvePublicOrigin, type OriginInput } from "../lib/public-origin";

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

console.log(`\n${n} Prüfungen bestanden.`);
