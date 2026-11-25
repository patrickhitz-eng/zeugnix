import { after, NextResponse, type NextRequest } from "next/server";

import { handleAnfordern } from "@/lib/auth/anfordern";
import { authSecret, LOGIN_TTL_MINUTES, RATE_LIMITS, siteOrigin } from "@/lib/auth/config";
import { rejectForeignOrigin } from "@/lib/auth/route-guard";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { storeLoginRequest } from "@/lib/auth/store";
import { sendEmail } from "@/lib/email/send";
import { buildLoginEmail } from "@/lib/email/templates";
import { logError } from "@/lib/log";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { siteConfig } from "@/lib/site-config";

/**
 * POST /api/auth/anfordern   Body: { email, next? }
 *
 * Eigene Anmeldung, Schritt 1: Link und Code erzeugen, nur deren HMAC
 * speichern, Mail verschicken. Die Antwort ist für jede gültige Adresse
 * dieselbe – der Ablauf steht in lib/auth/anfordern.ts, damit test:auth genau
 * das prüfen kann.
 *
 * In keiner Logzeile dieser Route steht eine Adresse, ein Link oder ein Code.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { email?: unknown; next?: unknown } | null;

  try {
    const result = await handleAnfordern(
      {
        email: body?.email,
        next: sanitizeNext(typeof body?.next === "string" ? body.next : null),
      },
      {
        secret: authSecret(),
        signupOpen: siteConfig.signup.open,
        siteOrigin: siteOrigin(),
        clientIp: getClientIp(req),
        rateLimit: async (key, kind) => {
          const rule = kind === "ip" ? RATE_LIMITS.anfordernProIp : RATE_LIMITS.anfordernProAdresse;
          return (await rateLimit(key, rule.limit, rule.windowMs)).ok;
        },
        storeRequest: storeLoginRequest,
        sendLoginMail: async ({ to, linkUrl, code }) => {
          const mail = buildLoginEmail({ linkUrl, code, validMinutes: LOGIN_TTL_MINUTES });
          const sent = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text });
          if (!sent.sent) logError("[auth] Anmelde-Mail nicht verschickt:", sent.reason ?? "unbekannt");
        },
        schedule: (task) =>
          after(() =>
            task().catch((error) => logError("[auth] Anmelde-Mail fehlgeschlagen:", error)),
          ),
      },
    );
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("[auth] Anforderung fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es in ein paar Minuten erneut." },
      { status: 503 },
    );
  }
}
