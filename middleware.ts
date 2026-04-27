import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware – robust gegen fehlende ENV-Variablen.
 *
 * Wichtig: Auch wenn Supabase noch nicht konfiguriert ist (oder ein ENV
 * fehlt), darf die Landingpage NIE crashen. Öffentliche Seiten laufen
 * komplett ohne Supabase. Nur /app/* braucht Auth.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

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
      return NextResponse.redirect(url);
    }
    // Öffentliche Seiten: einfach durchlassen
    return NextResponse.next({ request });
  }

  // Fall B: ENV ist da – Supabase-Logik nur, wenn nötig
  let supabaseResponse = NextResponse.next({ request });

  // Auf öffentlichen Seiten kein getUser() nötig – spart Latenz und macht
  // die Seite robust gegen Supabase-Ausfälle.
  if (isPublic) {
    return supabaseResponse;
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
          supabaseResponse = NextResponse.next({ request });
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
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (err) {
    // Falls Supabase nicht erreichbar ist: Public Routes durchlassen,
    // App-Routes auf Login-Seite mit Hinweis umleiten
    console.error("[middleware] Supabase error:", err);
    if (path.startsWith("/app") && !path.startsWith("/app/invitations")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "service_unavailable");
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
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
