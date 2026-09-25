/**
 * Logging mit Redaktion.
 *
 * Auf Vercel waren Logs eine Nebensache. Nach dem Umzug auf eigene
 * Infrastruktur sind sie die einzige Betriebssicht – und damit ein zweiter Ort,
 * an dem Personendaten liegen, mit eigener Aufbewahrungsfrist und ohne
 * Löschkonzept. Fehlerobjekte von PostgREST oder vom Mailversand enthalten
 * regelmässig genau das, was nicht ins Log gehört: Empfängeradressen,
 * Zeilendaten, Tokens.
 *
 * Deshalb geht alles, was hier geloggt wird, vorher durch `redact()`.
 * Zeugnis- und Firmen-IDs bleiben absichtlich stehen – ohne sie ist ein Log
 * für die Fehlersuche wertlos, und allein sagen sie nichts über eine Person.
 */

/** E-Mail-Adressen – der häufigste PII-Träger in Fehlermeldungen. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g;
/** IPv4: letztes Oktett weg, der Rest genügt zur Missbrauchserkennung. */
const IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g;
/** JWTs (Supabase-Tokens tauchen in Fehlertexten auf). */
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g;
/** Sonst schiebt ein einzelner Fehler den halben Zeugnistext ins Log. */
const MAX_LENGTH = 600;

function stringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function redact(value: unknown): string {
  const text = stringify(value)
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]")
    .replace(IPV4, "$1.x");

  return text.length > MAX_LENGTH
    ? `${text.slice(0, MAX_LENGTH)}… [${text.length - MAX_LENGTH} Zeichen gekürzt]`
    : text;
}

function emit(
  level: "info" | "warn" | "error",
  context: string,
  parts: unknown[],
): void {
  const line = [context, ...parts.map(redact)].join(" ");
  // eslint-disable-next-line no-console
  console[level](line);
}

export function logInfo(context: string, ...parts: unknown[]): void {
  emit("info", context, parts);
}

export function logWarn(context: string, ...parts: unknown[]): void {
  emit("warn", context, parts);
}

export function logError(context: string, ...parts: unknown[]): void {
  emit("error", context, parts);
}
