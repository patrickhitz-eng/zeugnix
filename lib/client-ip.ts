/**
 * zeugnio – Client-IP hinter dem Proxy
 * ----------------------------------------------------------------------------
 * Gebraucht für Rate-Limits und als Beleg einer Unterzeichner-Freigabe
 * (`confirmed_ip`). Darum zählt nur, was der eigene Proxy setzt:
 *
 * - `x-real-ip` setzen Vercel und der nginx auf advisori01 (nine) auf die
 *   Gegenstelle der TCP-Verbindung, also die echte Adresse.
 * - `x-forwarded-for` bringt der Browser schon mit; der Proxy hängt die echte
 *   Adresse nur HINTEN an. Der ERSTE Eintrag lässt sich darum frei fälschen,
 *   als Ersatz taugt nur der LETZTE.
 *
 * Bis zum Umzug nahm zeugnio den ersten Eintrag. Auf Vercel war das harmlos,
 * weil Vercel den Kopf neu schreibt; hinter nginx wäre jedes Rate-Limit mit
 * einem erfundenen Kopf zu umgehen (Fahrplan Marktstart, Schritt 27). Gleiches
 * Muster wie Albis Run (`src/lib/requestInfo.ts`).
 *
 * Eigenes Modul ohne Server-Abhängigkeiten, damit `npm run test:client-ip` es
 * direkt laden kann. `lib/rate-limit.ts` reicht es unverändert weiter.
 */
export function getClientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const last = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last || "unknown";
}

/**
 * Schlüssel für ein Rate-Limit pro Anschluss (Sicherheitstest 24.11.2026, M5).
 *
 * Wer einen IPv6-Anschluss hat, bekommt vom Provider in der Regel ein ganzes
 * /64-Netz, also 2^64 Adressen, und darf jede davon frei benutzen. Zählte das
 * Limit pro Einzeladresse, nähme ein Angreifer für jede Anfrage eine neue
 * Adresse und käme nie an die Grenze. Darum zählt bei IPv6 nur das /64-Präfix
 * (die ersten 4 von 8 Blöcken). Bei IPv4 bleibt es die volle Adresse.
 *
 * Normalisiert wird, damit dieselbe Adresse nicht in verschiedenen
 * Schreibweisen in verschiedenen Zählern landet:
 * - Kurzform `2001:db8::1` und Langform `2001:0db8:0:0:0:0:0:1` ergeben
 *   dasselbe, ebenso Gross- und Kleinschreibung.
 * - `::ffff:203.0.113.7` (eine IPv4-Adresse in IPv6-Form, so liefert sie Node
 *   auf einem Dual-Stack-Socket) wird wieder zu `203.0.113.7`.
 * - Klammern `[…]` und eine Zonenangabe `%eth0` fallen weg.
 *
 * Nur für Zählerschlüssel. Als Beleg (`confirmed_ip`) gilt weiter die volle
 * Adresse aus getClientIp().
 */
export function rateLimitIp(ip: string): string {
  const raw = ip.trim().toLowerCase();
  if (!raw) return "unknown";
  if (!raw.includes(":")) return raw;

  const blocks = parseIpv6(raw);
  // Unlesbar: so lassen. Ein Proxy liefert nie so etwas, und ein eigener
  // Zähler für eine kaputte Angabe schadet nicht.
  if (!blocks) return raw;

  const mappedV4 = blocks.slice(0, 5).every((b) => b === 0) && blocks[5] === 0xffff;
  if (mappedV4) {
    return [blocks[6] >> 8, blocks[6] & 0xff, blocks[7] >> 8, blocks[7] & 0xff].join(".");
  }
  return `${blocks
    .slice(0, 4)
    .map((b) => b.toString(16))
    .join(":")}::/64`;
}

/** Client-IP aus den Proxy-Köpfen, fertig als Zählerschlüssel (siehe rateLimitIp). */
export function clientIpKey(req: Request): string {
  return rateLimitIp(getClientIp(req));
}

function parseIpv4(text: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return null;
  const parts = text.split(".").map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** Zerlegt eine IPv6-Adresse in ihre 8 Blöcke zu 16 Bit, sonst null. */
function parseIpv6(input: string): number[] | null {
  let text = input;
  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    if (end < 0) return null;
    text = text.slice(1, end);
  }
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);

  // Eine eingebettete IPv4-Adresse am Ende (::ffff:1.2.3.4) in zwei Blöcke umschreiben.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const rest = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  }

  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}
