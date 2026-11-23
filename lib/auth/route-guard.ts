import { NextResponse, type NextRequest } from "next/server";

import { authMode, RATE_LIMITS, siteOrigin } from "./config";
import { allowedOrigins, isAllowedOrigin } from "./origin";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Gemeinsame Vorprüfungen der Anmelde-Routen unter /api/auth/*.
 * Gibt eine fertige Fehlerantwort zurück oder `null`, wenn es weitergehen darf.
 */

/** Herkunft prüfen (Plan § 6.6). */
export function rejectForeignOrigin(req: NextRequest): NextResponse | null {
  const allowed = allowedOrigins({
    siteOrigin: siteOrigin(),
    requestOrigin: req.nextUrl.origin,
    production: process.env.NODE_ENV === "production",
  });
  if (isAllowedOrigin(req.headers.get("origin"), allowed)) return null;
  return NextResponse.json({ error: "Anfrage von fremder Herkunft abgelehnt." }, { status: 403 });
}

/** Die Routen der eigenen Anmeldung antworten nur, wenn der Schalter auf «eigen» steht. */
export function rejectUnlessEigen(): NextResponse | null {
  if (authMode() === "eigen") return null;
  return NextResponse.json({ error: "Nicht verfügbar." }, { status: 404 });
}

/** Ratenbegrenzung für das Einlösen von Code und Link, pro IP. */
export async function rejectTooManyRedeems(req: NextRequest): Promise<NextResponse | null> {
  const { limit, windowMs } = RATE_LIMITS.einloesenProIp;
  const result = await rateLimit(`auth:einloesen:ip:${getClientIp(req)}`, limit, windowMs);
  return result.ok ? null : tooManyRequests(result.retryAfter);
}
