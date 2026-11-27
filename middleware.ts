import { NextResponse, type NextRequest } from "next/server";
import { judgeOrigin, needsOriginCheck } from "@/lib/api-origin";
import { authSecret, SESSION_COOKIE, siteOrigin } from "@/lib/auth/config";
import { clearedSessionCookie, sessionCookie } from "@/lib/auth/cookie";
import { allowedOrigins } from "@/lib/auth/origin";
import { lookupSession } from "@/lib/auth/store";
import { hmac, isTokenShape } from "@/lib/auth/tokens";
import { logError, logWarn } from "@/lib/log";
import { legacyHostRedirect, publicOrigin } from "@/lib/public-origin";

/**
 * Middleware – Sicherheitsheader und Anmeldeprüfung.
 *
 * Wichtig: Auch wenn die Datenbank nicht erreichbar ist oder ein ENV fehlt,
 * darf die Landingpage NIE crashen. Öffentliche Seiten laufen ohne
 * Sitzungsprüfung. Nur /app/* braucht eine Anmeldung.
 *
 * Hier wird ausserdem die Content-Security-Policy gesetzt. Sie steht hier und
 * nicht in next.config.mjs, weil sie pro Request eine frische Nonce braucht;
 * die statischen Sicherheitsheader (HSTS & Co.) bleiben in next.config.mjs.
 * Zweck über den üblichen XSS-Schutz hinaus: Die Policy ist der strukturelle
 * Riegel gegen neue Abflüsse aus der Schweiz – ein nachträglich eingebautes
 * CDN, Analytics-Snippet oder Fremd-Font fällt sofort auf, statt still zu
 * funktionieren.
 *
 * Anmeldung: Die Sitzung prüft zeugnio selbst, über das Cookie
 * __Host-zeugnio_session und auth.sessions auf advisori01 (Cutover B). Darum
 * läuft die Middleware in der Node-Laufzeit (Entscheid E4, config unten): HMAC
 * und Datenbankzugriff nutzen denselben Code wie die Routen.
 */

/**
 * Nur dynamisch gerenderte Antworten können eine Nonce tragen: Statisch
 * vorgerenderte Seiten (Startseite, Preise, alle Marketing-Seiten) entstehen
 * beim Build, lange bevor es einen Request gibt. Würde man ihnen eine
 * Nonce-Policy mit 'strict-dynamic' aufzwingen, blockierte der Browser dort
 * *sämtliches* JavaScript — die Seite sieht dann normal aus, reagiert aber auf
 * nichts mehr. Deshalb gilt die strenge Policy für den angemeldeten Bereich
 * und die Prüfung, wo die Personendaten liegen; die Marketing-Seiten bekommen
 * dieselbe Aussen-Abschottung, aber 'unsafe-inline' für Skripte.
 *
 * Wer hier eine Route ergänzt, muss sicherstellen, dass sie dynamisch
 * gerendert wird (`ƒ` in der Build-Ausgabe, nicht `○`).
 */
const NONCE_PREFIXES = ["/app", "/login", "/verify", "/auth", "/api"];

function servesNonce(path: string): boolean {
  return NONCE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function buildCsp(nonce: string | null, isDev: boolean): string {
  const scriptSrc = nonce
    ? [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        // pdfjs-dist >= 4 führt für die Zeugnisprüfung WASM aus.
        "'wasm-unsafe-eval'",
        // Next-HMR wertet in der Entwicklung eval aus.
        ...(isDev ? ["'unsafe-eval'"] : []),
      ]
    : [
        // Next.js bettet den RSC-Payload in Inline-Skripte ein; ohne Nonce
        // bleibt nur 'unsafe-inline'. Der Schutz gegen Abflüsse hängt hier
        // nicht am script-src, sondern an default-/connect-/img-/font-src.
        "'self'",
        "'unsafe-inline'",
        ...(isDev ? ["'unsafe-eval'"] : []),
      ];
  // Der Browser spricht nur mit zeugnio selbst: Anmeldung, Daten und Firmenlogos
  // (/api/logos/…) laufen alle über die eigene Adresse (Plan cutover-b § 1,
  // «messbar fertig»). ws: nur für das Neuladen in der Entwicklung.
  const connectSrc = ["'self'", ...(isDev ? ["ws:"] : [])];
  // blob:/data: für Vorschauen (Logo vor dem Hochladen, PDF-Ansicht).
  const imgSrc = ["'self'", "data:", "blob:"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Tailwind und React erzeugen Inline-Styles; eine Nonce hilft hier nicht.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src ${imgSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    // Der pdf.js-Worker kommt aus dem eigenen Build (public/pdfjs/).
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isDev = process.env.NODE_ENV !== "production";

  // Altdomain zeugnix.ch → zeugnio.ch, vor allem anderen (lib/public-origin.ts).
  const legacy = legacyHostRedirect(publicOrigin(request), path + request.nextUrl.search);
  if (legacy) return NextResponse.redirect(legacy, 308);

  // Herkunft jeder schreibenden API-Anfrage (lib/api-origin.ts): Nur die
  // eigenen Seiten dürfen unter /api/* etwas ändern. Dieselbe Liste erlaubter
  // Adressen wie bei den Anmelde-Routen (lib/auth/route-guard.ts).
  if (needsOriginCheck(request.method, path)) {
    const verdict = judgeOrigin({
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      allowed: allowedOrigins({
        siteOrigin: siteOrigin(),
        requestOrigin: request.nextUrl.origin,
        production: !isDev,
      }),
    });
    if (verdict !== "ok") {
      // Nur Methode und erster Pfadteil: Der volle Pfad kann einen Token tragen.
      logWarn("[origin] abgewiesen:", request.method, path.split("/").slice(0, 3).join("/"), verdict);
      return NextResponse.json({ error: "Anfrage von fremder Herkunft abgelehnt." }, { status: 403 });
    }
  }

  const nonce = servesNonce(path) ? btoa(crypto.randomUUID()) : null;
  const csp = buildCsp(nonce, isDev);
  // In der Entwicklung und solange CSP_REPORT_ONLY=1 gesetzt ist, wird nur
  // berichtet statt blockiert. So lässt sich die Policy auf einer Preview
  // beobachten, bevor sie in Produktion scharf geschaltet wird.
  const cspResponseHeader =
    isDev || process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

  /**
   * Nonce und Policy an das Rendering weiterreichen: Next.js liest die Nonce
   * aus dem Request-Header und hängt sie an die eigenen Script-Tags. Ohne das
   * blockiert 'strict-dynamic' das gesamte JavaScript der Seite.
   */
  function forwardedHeaders(): Headers {
    const headers = new Headers(request.headers);
    // Aufgerufener Pfad für Server-Layouts, die ihn sonst nicht kennen: Das
    // App-Layout schickt ihn als `next` an /app/zustimmung mit. Immer hier
    // gesetzt, damit ein mitgeschickter Header gleichen Namens nichts bewirkt.
    headers.set(
      "x-zeugnio-path",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    if (nonce) {
      headers.set("x-nonce", nonce);
      headers.set("Content-Security-Policy", csp);
    }
    return headers;
  }

  function sealed(response: NextResponse): NextResponse {
    response.headers.set(cspResponseHeader, csp);
    return response;
  }

  // Weiterleitung zur Anmeldung, mit der Adresse, die der Browser kennt.
  // request.nextUrl trägt den Host, unter dem Next die Anfrage bekommt. Hinter
  // nginx auf advisori01 ist das localhost:3010, weil nginx den ursprünglichen
  // Hostnamen nicht weitergibt; die Weiterleitung schickte den Browser nach
  // https://localhost:3010/login (gemessen 12.11. auf test.zeugnio.ch).
  // Relativ («/login?…») geht nicht: Next lehnt in der Middleware einen
  // relativen Location-Kopf ab («Invalid URL», jede App-Seite gibt 500).
  function redirectToLogin(params: Record<string, string>): NextResponse {
    const url = new URL("/login", publicOrigin(request));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  }


  // Die Seite /auth/callback (Anmeldung über Supabase) gibt es seit B2 nicht
  // mehr. Links aus alten Anmelde-Mails lassen sich nicht mehr einlösen; die
  // Anmeldeseite sagt das, und man fordert dort eine neue Mail an. Bewusst hier
  // und nicht in next.config.mjs: dort ginge der alte token_hash aus der
  // Adresse mit auf /login über.
  if (path === "/auth/callback") {
    return sealed(redirectToLogin({ error: "link_ungueltig" }));
  }

  // Öffentliche Routen – keine Sitzungsprüfung nötig
  const isPublic =
    path === "/" ||
    path === "/login" ||
    path === "/verify" ||
    path === "/pricing" ||
    path === "/how-it-works" ||
    path.startsWith("/for-") ||
    path.startsWith("/legal") ||
    path.startsWith("/auth/link") ||
    // Anmelde-Routen prüfen selbst (Herkunft, Ratenbegrenzung, Sitzung).
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/verify") ||
    path.startsWith("/api/analyze") ||
    // Firmenlogos: liegen auf der Platte und sind ohne Anmeldung abrufbar (wie
    // früher im öffentlichen Bucket). Ohne diese Zeile käme pro Bild eine
    // Sitzungsprüfung dazu – für eine Datei, die ohnehin jeder sehen darf, der
    // die Adresse kennt.
    path.startsWith("/api/logos/") ||
    path.startsWith("/api/health") ||
    // Token-Links für Personen ohne Konto: Einladung an die vorgesetzte Person
    // und Freigabe der unterzeichnenden Person. Die Seiten prüfen den Token
    // selbst (über seinen Hash, lib/link-token.ts). /app/signoffs fehlte hier
    // seit der Einführung der Freigabe (25.8.2026): Ohne Konto landete man auf
    // der Anmeldung statt beim Zeugnistext.
    path.startsWith("/app/invitations") ||
    path.startsWith("/app/signoffs/");

  return sealed(await eigeneSitzung());

  /**
   * Anmeldung: Cookie lesen, Sitzung in auth.sessions nachschlagen.
   * Ohne Sitzung führt /app/* zur Anmeldung, /api/* lässt die Route selbst mit
   * 401 antworten (wie bisher). Wurde die Sitzung eben verlängert, bekommt auch
   * das Cookie wieder 30 Tage; ist sie ungültig, wird das Cookie gelöscht.
   */
  async function eigeneSitzung(): Promise<NextResponse> {
    const appPath =
      path.startsWith("/app") &&
      !path.startsWith("/app/invitations") &&
      !path.startsWith("/app/signoffs/");
    if (isPublic) return NextResponse.next({ request: { headers: forwardedHeaders() } });

    const raw = request.cookies.get(SESSION_COOKIE)?.value;
    const token = isTokenShape(raw) ? raw : null;
    try {
      const user = token ? await lookupSession(hmac(authSecret(), "session", token)) : null;
      const response = !user && appPath
        ? redirectToLogin({ next: path })
        : NextResponse.next({ request: { headers: forwardedHeaders() } });
      if (user?.renewed && token) {
        const c = sessionCookie(token);
        response.cookies.set(c.name, c.value, c.options);
      } else if (raw && !user) {
        const c = clearedSessionCookie();
        response.cookies.set(c.name, c.value, c.options);
      }
      return response;
    } catch (err) {
      logError("[middleware] Sitzung nicht prüfbar:", err);
      if (appPath) return redirectToLogin({ error: "service_unavailable" });
      return NextResponse.next({ request: { headers: forwardedHeaders() } });
    }
  }
}

export const config = {
  // Node statt Edge (Entscheid E4, seit Next 15.5 stabil): node:crypto für den
  // HMAC der Sitzungskennung und derselbe Datenbankzugang wie in den Routen.
  runtime: "nodejs",
  matcher: [
    /*
     * Alle Pfade ausser:
     * - _next/static
     * - _next/image
     * - favicon.ico, sitemap.xml, robots.txt
     * - statische Bildformate
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // Jede API-Adresse, auch eine, die auf «.png» endet: Sonst liefe etwa
    // PATCH /api/companies/x.png an der Herkunftsprüfung oben vorbei.
    "/api/:path*",
  ],
};
