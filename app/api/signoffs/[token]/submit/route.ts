import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Öffentlicher Token-Endpunkt → Rate-Limit gegen Missbrauch.
const SUBMIT_LIMIT = 30;
const SUBMIT_WINDOW_MS = 60 * 1000;

/**
 * POST /api/signoffs/[token]/submit
 * Body: { action: 'confirm' | 'decline' }
 *
 * Öffentlicher (token-basierter) Endpunkt: die benannte unterzeichnende Person
 * bestätigt oder lehnt das Zeugnis ab. Bestätigung = identitätsgebundene
 * Freigabe (E-Mail der Person ist bereits in der Zeile hinterlegt); Zeitpunkt,
 * IP und User-Agent werden protokolliert.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limited = await rateLimit(`signoff-submit:${getClientIp(req)}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action;
  if (action !== "confirm" && action !== "decline") {
    return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: signoff } = await svc
    .from("certificate_signoffs")
    .select("id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!signoff) {
    return NextResponse.json({ error: "Freigabe-Link ungültig." }, { status: 404 });
  }

  if (signoff.status === "confirmed" || signoff.status === "declined") {
    // Idempotent: bereits final beantwortet.
    return NextResponse.json({ ok: true, status: signoff.status, already: true });
  }

  if (new Date(signoff.expires_at) < new Date()) {
    await svc
      .from("certificate_signoffs")
      .update({ status: "expired" })
      .eq("id", signoff.id);
    return NextResponse.json({ error: "Freigabe-Link ist abgelaufen." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const update =
    action === "confirm"
      ? {
          status: "confirmed",
          confirmed_at: nowIso,
          confirmed_ip: getClientIp(req),
          confirmed_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
        }
      : { status: "declined" };

  const { error: updErr } = await svc
    .from("certificate_signoffs")
    .update(update)
    .eq("id", signoff.id);

  if (updErr) {
    return NextResponse.json(
      { error: `Antwort konnte nicht gespeichert werden: ${updErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: action === "confirm" ? "confirmed" : "declined" });
}
