/**
 * Tests für die Client-IP hinter dem Proxy — lib/client-ip.ts.
 *
 * Ausführen:
 *   npm run test:client-ip   (bzw. npx tsx scripts/test-client-ip.ts)
 *
 * Die IP steuert die Rate-Limits und steht als Beleg in jeder Unterzeichner-
 * Freigabe. Ein gefälschter erster `x-forwarded-for`-Eintrag darf darum nie
 * durchkommen.
 */

import { getClientIp } from "../lib/client-ip";

let passed = 0;
let failed = 0;

function eq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name} — erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
    failed++;
  }
}

function req(headers: Record<string, string>): Request {
  return new Request("https://zeugnio.ch/api/verify", { headers });
}

console.log("\nx-real-ip (vom Proxy gesetzt)");
eq("wird genommen", getClientIp(req({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
eq("Leerzeichen entfernt", getClientIp(req({ "x-real-ip": "  203.0.113.7 " })), "203.0.113.7");
eq(
  "schlägt x-forwarded-for",
  getClientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 198.51.100.1" })),
  "203.0.113.7",
);

console.log("\nx-forwarded-for ohne x-real-ip");
eq(
  "gefälschter erster Eintrag zählt nicht",
  getClientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" })),
  "203.0.113.7",
);
eq("einziger Eintrag", getClientIp(req({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
eq(
  "IPv6, letzter Eintrag",
  getClientIp(req({ "x-forwarded-for": "6.6.6.6,2001:db8::1" })),
  "2001:db8::1",
);

console.log("\nohne Proxy-Köpfe");
eq("keine Köpfe", getClientIp(req({})), "unknown");
eq("leeres x-real-ip fällt durch", getClientIp(req({ "x-real-ip": " " })), "unknown");
eq("leerer letzter Eintrag", getClientIp(req({ "x-forwarded-for": "6.6.6.6, " })), "unknown");

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
