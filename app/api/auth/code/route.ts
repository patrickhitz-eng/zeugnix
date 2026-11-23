import { NextResponse, type NextRequest } from "next/server";

import { authSecret } from "@/lib/auth/config";
import { sessionCookie } from "@/lib/auth/cookie";
import { rejectForeignOrigin, rejectTooManyRedeems } from "@/lib/auth/route-guard";
import { redeemCode } from "@/lib/auth/store";
import { codeHmac, hmac, isCodeShape, isPlausibleEmail, newToken, normalizeEmail } from "@/lib/auth/tokens";
import { logError } from "@/lib/log";
import { siteConfig } from "@/lib/site-config";

/**
 * POST /api/auth/code   Body: { email, code }
 *
 * Eigene Anmeldung, Weg A: Code aus der Mail eintippen. Die Datenbank prüft
 * HMAC gegen HMAC, zählt Fehlversuche (ab 5 ist die Anforderung verbrannt) und
 * eröffnet bei Erfolg im selben Zug die Sitzung (906: auth_redeem_code).
 *
 * Für «vertippt», «abgelaufen» und «schon benutzt» gibt es absichtlich nur eine
 * Antwort: die Datenbank unterscheidet die Fälle nach aussen nicht, und die
 * richtige Handlung ist in allen dreien dieselbe.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNGUELTIG =
  "Dieser Code stimmt nicht oder ist nicht mehr gültig. Prüfen Sie die Eingabe oder fordern Sie einen neuen Code an.";

export async function POST(req: NextRequest) {
  const blocked = rejectForeignOrigin(req) ?? (await rejectTooManyRedeems(req));
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!isPlausibleEmail(email) || !isCodeShape(code)) {
    return NextResponse.json({ error: UNGUELTIG }, { status: 400 });
  }

  try {
    const secret = authSecret();
    const token = newToken();
    const user = await redeemCode({
      email,
      codeHmac: codeHmac(secret, email, code),
      sessionHmac: hmac(secret, "session", token),
      signupOpen: siteConfig.signup.open,
    });
    if (!user) return NextResponse.json({ error: UNGUELTIG }, { status: 400 });

    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    const c = sessionCookie(token);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (error) {
    logError("[auth] Code einlösen fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es in ein paar Minuten erneut." },
      { status: 503 },
    );
  }
}
