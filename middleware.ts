import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/log";

/**
 * Middleware – robust gegen fehlende ENV-Variablen.
 *
 * Wichtig: Auch wenn Supabase noch nicht konfiguriert ist (oder ein ENV
 * fehlt), darf die Landingpage NIE crashen. Öffentliche Seiten laufen
 * komplett ohne Supabase. Nur /app/* braucht Auth.
 *
 * Hier wird ausserdem die Content-Security-Policy gesetzt. Sie steht hier und
 * nicht in next.config.mjs, weil sie pro Request eine frische Nonce braucht;
 * die statischen Sicherheitsheader (HSTS & Co.) bleiben in next.config.mjs.
 * Zweck über den üblichen XSS-Schutz hinaus: Die Policy ist der strukturelle
 * Riegel gegen neue Abflüsse aus der Schweiz – ein nachträglich eingebautes
 * CDN, Analytics-Snippet oder Fremd-Font fällt sofort auf, statt still zu
 * funktionieren.
 */

/** Herkunft der Daten-API (heute Supabase, nach dem Cutover die eigene). */
function dataApiOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

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
  const api = dataApiOrigin();

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
  const connectSrc = ["'self'", api, ...(isDev ? ["ws:"] : [])].filter(Boolean);
  // Firmenlogos liegen heute im Supabase-Storage; blob:/data: für Vorschauen.
  const imgSrc = ["'self'", "data:", "blob:", api].filter(Boolean);

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

  // Öffentliche Routen – kein Supabase-Touch nötig
  const isPublic =
    path === "/" ||
    path === "/login" ||
    path === "/verify" ||
    path === "/pricing" ||
    path === "/how-it-works" ||
    path.startsWith("/for-") ||
    path.startsWith("/legal") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/verify") ||
    path.startsWith("/api/analyze") ||
    // Firmenlogos: liegen auf der Platte und sind wie bisher im öffentlichen
    // Supabase-Bucket ohne Anmeldung abrufbar. Ohne diese Zeile käme pro Bild
    // ein getUser() gegen Supabase dazu – für eine Datei, die ohnehin jeder
    // sehen darf, der die Adresse kennt.
    path.startsWith("/api/logos/") ||
    path.startsWith("/api/health") ||
    path.startsWith("/app/invitations"); // Token-basiert, kein Login nötig

  // ENV-Vars prüfen
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabaseConfig = !!(supabaseUrl && supabaseKey);

  // Fall A: ENV fehlt komplett
  if (!hasSupabaseConfig) {
    if (path.startsWith("/app") && !path.startsWith("/app/invitations")) {
      // App-Bereich braucht Supabase – auf Setup-Hinweis umleiten
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "setup_incomplete");
      return sealed(NextResponse.redirect(url));
    }
    // Öffentliche Seiten: einfach durchlassen
    return sealed(NextResponse.next({ request: { headers: forwardedHeaders() } }));
  }

  // Fall B: ENV ist da – Supabase-Logik nur, wenn nötig
  let supabaseResponse = NextResponse.next({
    request: { headers: forwardedHeaders() },
  });

  // Auf öffentlichen Seiten kein getUser() nötig – spart Latenz und macht
  // die Seite robust gegen Supabase-Ausfälle.
  if (isPublic) {
    return sealed(supabaseResponse);
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: any }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: forwardedHeaders() },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !user &&
      path.startsWith("/app") &&
      !path.startsWith("/app/invitations")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return sealed(NextResponse.redirect(url));
    }

    return sealed(supabaseResponse);
  } catch (err) {
    // Falls Supabase nicht erreichbar ist: Public Routes durchlassen,
    // App-Routes auf Login-Seite mit Hinweis umleiten
    logError("[middleware] Supabase error:", err);
    if (path.startsWith("/app") && !path.startsWith("/app/invitations")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "service_unavailable");
      return sealed(NextResponse.redirect(url));
    }
    return sealed(NextResponse.next({ request: { headers: forwardedHeaders() } }));
  }
}

export const config = {
  matcher: [
    /*
     * Alle Pfade ausser:
     * - _next/static
     * - _next/image
     * - favicon.ico, sitemap.xml, robots.txt
     * - statische Bildformate
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
