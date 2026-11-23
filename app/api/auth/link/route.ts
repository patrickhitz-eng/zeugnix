import { NextResponse, type NextRequest } from "next/server";

import { authSecret } from "@/lib/auth/config";
import { sessionCookie } from "@/lib/auth/cookie";
import { rejectForeignOrigin, rejectTooManyRedeems } from "@/lib/auth/route-guard";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { redeemLink } from "@/lib/auth/store";
import { hmac, isTokenShape, newToken } from "@/lib/auth/tokens";
import { logError } from "@/lib/log";
import { publicOrigin } from "@/lib/public-origin";
import { siteConfig } from "@/lib/site-config";

/**
 * POST /api/auth/link   Formular: t, next
 *
 * Eigene Anmeldung, Weg B: Der Link in der Mail führt auf /auth/link. Diese
 * Seite zeigt nur einen Knopf und verbraucht nichts. Erst das Absenden des
 * Formulars kommt hierher und löst den Link ein.
 *
 * Warum der Umweg über einen Knopf: Microsoft Defender Safe Links ruft jeden
 * Link einer Mail vorab auf. Ein Link, den schon der erste Aufruf verbraucht,
 * wäre tot, bevor der Mensch klickt (zeugnio 2026, PR #30). Ein Scanner folgt
 * Links (GET), schickt aber keine Formulare ab (POST).
 *
 * Ein gewöhnliches HTML-Formular statt fetch: es funktioniert auch, wenn
 * JavaScript blockiert ist, und die Antwort ist eine Weiterleitung (303), mit
 * der das Cookie gleich mitkommt.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, publicOrigin(req)), 303);
}

export async function POST(req: NextRequest) {
  const blocked = rejectForeignOrigin(req) ?? (await rejectTooManyRedeems(req));
  if (blocked) return blocked;

  const form = await req.formData().catch(() => null);
  const t = form?.get("t");
  const next = sanitizeNext(typeof form?.get("next") === "string" ? (form?.get("next") as string) : null);
  if (typeof t !== "string" || !isTokenShape(t)) {
    return redirectTo(req, "/login?error=link_ungueltig");
  }

  try {
    const secret = authSecret();
    const token = newToken();
    const user = await redeemLink({
      linkHmac: hmac(secret, "link", t),
      sessionHmac: hmac(secret, "session", token),
      signupOpen: siteConfig.signup.open,
    });
    if (!user) return redirectTo(req, "/login?error=link_ungueltig");

    const res = redirectTo(req, next);
    const c = sessionCookie(token);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (error) {
    logError("[auth] Link einlösen fehlgeschlagen:", error);
    return redirectTo(req, "/login?error=service_unavailable");
  }
}
