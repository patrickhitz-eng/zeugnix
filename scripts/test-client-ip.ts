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

import { clientIpKey, getClientIp, rateLimitIp } from "../lib/client-ip";

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

function ok(name: string, condition: boolean) {
  eq(name, condition, true);
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

console.log("\nZählerschlüssel: IPv4 voll, IPv6 pro /64 (M5)");
eq("IPv4 bleibt die volle Adresse", rateLimitIp("203.0.113.7"), "203.0.113.7");
eq("IPv4 mit Leerzeichen", rateLimitIp(" 203.0.113.7 "), "203.0.113.7");
eq("IPv6 wird zum /64", rateLimitIp("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
eq(
  "zwei Adressen im selben /64: gleicher Schlüssel",
  rateLimitIp("2001:db8:1:2::1"),
  rateLimitIp("2001:db8:1:2:ffff:ffff:ffff:ffff"),
);
ok("Nachbar-/64: anderer Schlüssel", rateLimitIp("2001:db8:1:2::1") !== rateLimitIp("2001:db8:1:3::1"));
eq("Kurzform und Langform gleich", rateLimitIp("2001:0db8:0000:0001:0:0:0:1"), "2001:db8:0:1::/64");
eq("Kurzform mit :: in der Mitte", rateLimitIp("2001:db8::1"), "2001:db8:0:0::/64");
eq("Grossbuchstaben", rateLimitIp("2001:DB8:A:B::1"), "2001:db8:a:b::/64");
eq("::ffff:-IPv4 wird zur IPv4-Adresse", rateLimitIp("::ffff:203.0.113.7"), "203.0.113.7");
eq("::ffff:-IPv4 in Hex-Form", rateLimitIp("::ffff:cb00:7107"), "203.0.113.7");
eq("::ffff:-IPv4 lang geschrieben", rateLimitIp("0:0:0:0:0:FFFF:203.0.113.7"), "203.0.113.7");
eq("Klammern fallen weg", rateLimitIp("[2001:db8:1:2::1]"), "2001:db8:1:2::/64");
eq("Zonenangabe fällt weg", rateLimitIp("fe80::1%eth0"), "fe80:0:0:0::/64");
eq("Loopback ::1", rateLimitIp("::1"), "0:0:0:0::/64");
eq("nur ::", rateLimitIp("::"), "0:0:0:0::/64");
eq("Adresse endet auf ::", rateLimitIp("2001:db8:1:2::"), "2001:db8:1:2::/64");
eq("unlesbar (zweimal ::) bleibt, wie sie ist", rateLimitIp("1::2::3"), "1::2::3");
eq("unlesbar (Block zu lang) bleibt, wie sie ist", rateLimitIp("12345::1"), "12345::1");
eq("unlesbar (IPv4-Teil > 255) bleibt, wie sie ist", rateLimitIp("::ffff:1.2.3.999"), "::ffff:1.2.3.999");
eq("leer wird unknown", rateLimitIp("  "), "unknown");
eq("unknown bleibt unknown", rateLimitIp("unknown"), "unknown");

console.log("\nclientIpKey (Kopf → Zählerschlüssel)");
eq("x-real-ip IPv6", clientIpKey(req({ "x-real-ip": "2001:db8:1:2::abcd" })), "2001:db8:1:2::/64");
eq(
  "x-forwarded-for, letzter Eintrag IPv6",
  clientIpKey(req({ "x-forwarded-for": "6.6.6.6, 2001:db8:1:2::abcd" })),
  "2001:db8:1:2::/64",
);
eq("getClientIp bleibt die volle Adresse (Beleg)", getClientIp(req({ "x-real-ip": "2001:db8:1:2::abcd" })), "2001:db8:1:2::abcd");

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
