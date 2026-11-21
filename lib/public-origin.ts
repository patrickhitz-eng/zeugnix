/**
 * Die Adresse, unter der der Browser die Seite sieht («https://zeugnio.ch»),
 * für absolute Weiterleitungen in der Middleware.
 *
 * Auf Vercel trägt die Anfrage den echten Host, request.nextUrl stimmt also.
 * Hinter nginx auf advisori01 kommt die Anfrage dagegen als localhost:3010 an,
 * weil nines Vorlage den Host-Kopf auf das Ziel von proxy_pass setzt (gemessen
 * 12.11.2026 auf test.zeugnio.ch). Darum, nur wenn der Host eine
 * Loopback-Adresse ist:
 *   1. X-Forwarded-Host – nines nginx setzt ihn (gemessen 13.11.2026: die
 *      Weiterleitung zeigt auf test.zeugnio.ch);
 *   2. sonst NEXT_PUBLIC_SITE_URL – aber nur im Produktionsbetrieb, damit
 *      `npm run dev` auf localhost nicht zur Live-Seite umleitet.
 *
 * X-Forwarded-Host kann ein Client selbst setzen. Er lenkt damit nur seine
 * eigene Weiterleitung um (kein Zwischenspeicher dazwischen); trotzdem wird
 * der Wert streng geprüft, damit nichts in den Location-Kopf gelangt, das
 * kein Hostname ist.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export interface OriginInput {
  /** request.nextUrl.hostname */
  hostname: string;
  /** request.nextUrl.origin */
  origin: string;
  /** request.nextUrl.protocol, z. B. "https:" */
  protocol: string;
  forwardedHost: string | null;
  forwardedProto: string | null;
  siteUrl: string | undefined;
  production: boolean;
}

export function resolvePublicOrigin(input: OriginInput): string {
  if (!LOOPBACK.has(input.hostname)) return input.origin;

  const host = input.forwardedHost?.split(",")[0]?.trim();
  if (host && HOST.test(host)) {
    const proto = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
    const scheme = proto === "http" || proto === "https" ? proto : input.protocol.replace(":", "");
    return `${scheme}://${host.toLowerCase()}`;
  }

  if (input.production && input.siteUrl) {
    try {
      return new URL(input.siteUrl).origin;
    } catch {
      // ungültige Angabe: auf den Host der Anfrage zurückfallen
    }
  }
  return input.origin;
}

/** Bequemer Aufruf aus der Middleware. */
export function publicOrigin(request: {
  nextUrl: { hostname: string; origin: string; protocol: string };
  headers: { get(name: string): string | null };
}): string {
  return resolvePublicOrigin({
    hostname: request.nextUrl.hostname,
    origin: request.nextUrl.origin,
    protocol: request.nextUrl.protocol,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    production: process.env.NODE_ENV === "production",
  });
}

/**
 * Die Altdomain zeugnix.ch auf zeugnio.ch weiterleiten, mit Pfad und Query,
 * damit alte Links und QR-Codes (etwa /verify/…) weiter funktionieren.
 * Bis zum Umzug machte das Vercel in den Domain-Einstellungen; nach Vercel
 * (Schritt 6.4) zeigt zeugnix.ch auf advisori01 und die App leitet selbst um.
 * Gibt die Zieladresse zurück oder null, wenn der Host keine Altdomain ist.
 */
const LEGACY_HOSTS = new Set(["zeugnix.ch", "www.zeugnix.ch"]);
export const CANONICAL_ORIGIN = "https://zeugnio.ch";

export function legacyHostRedirect(origin: string, pathAndSearch: string): string | null {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!LEGACY_HOSTS.has(host)) return null;
  const target = new URL(pathAndSearch.startsWith("/") ? pathAndSearch : "/", CANONICAL_ORIGIN);
  // Nur Pfad und Query übernehmen, nie einen anderen Host.
  return CANONICAL_ORIGIN + target.pathname + target.search;
}
