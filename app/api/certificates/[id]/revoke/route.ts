import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";

/**
 * POST /api/certificates/[id]/revoke
 *
 * Body: { reason?: string }
 *
 * Widerruft ein finalisiertes Zeugnis (H2). hash/canonical_content bleiben
 * unveraendert - nur der Status wechselt auf 'revoked' (Endzustand). Laeuft
 * ueber die RPC revoke_certificate (supabase/021_revocation_and_audit_log.sql),
 * damit RLS und der Immutability-Trigger exakt wie bei einem normalen
 * User-Update greifen.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status, company_id")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (cert.status !== "final") {
    return NextResponse.json(
      { error: "Nur finalisierte Zeugnisse können widerrufen werden." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const reason: string | null =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const { error } = await supabase.rpc("revoke_certificate", {
    p_certificate_id: id,
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json(
      { error: `Widerruf konnte nicht gespeichert werden: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
