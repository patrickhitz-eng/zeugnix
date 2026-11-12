import { NextRequest, NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  emailMatchesInvitation,
  hashInvitationToken,
  invitationState,
  isAccessRole,
} from "@/lib/team/invitations";
import { logError } from "@/lib/log";

/**
 * POST /api/team/invitations/accept
 * Body: { token }
 *
 * Die eingeladene Person nimmt an. Sie ist angemeldet, aber noch nicht Mitglied
 * und darf darum per Zeilenregel nichts in die Mitgliedertabellen schreiben.
 * Deshalb schreibt hier der Service-Client, nach drei Prüfungen:
 *   1. Der Token passt (verglichen wird sein SHA-256).
 *   2. Die Einladung ist offen: nicht angenommen, nicht zurückgezogen, nicht abgelaufen.
 *   3. Die angemeldete Adresse ist die eingeladene. Ein weitergeleiteter Link
 *      nützt also niemand anderem.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const limited = await rateLimit(`team-accept:${user.id}`, 20, 60 * 60 * 1000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 200) return NextResponse.json({ error: "Ungültiger Link." }, { status: 400 });

  const service = createServiceClient();
  const { data: inv, error: invErr } = await service
    .from("organization_invitations")
    .select("id, organization_id, email, org_role, company_role, company_ids, expires_at, accepted_at, accepted_by_user_id, revoked_at, organizations(name)")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (invErr) {
    logError("[team/accept] Einladung nicht lesbar:", invErr);
    return NextResponse.json({ error: "Die Einladung liess sich nicht prüfen." }, { status: 500 });
  }
  if (!inv) return NextResponse.json({ error: "Diese Einladung gibt es nicht." }, { status: 404 });

  const state = invitationState(inv);
  if (state === "angenommen") {
    if (inv.accepted_by_user_id === user.id) return NextResponse.json({ ok: true, already: true });
    return NextResponse.json({ error: "Diese Einladung wurde schon angenommen." }, { status: 410 });
  }
  if (state === "zurueckgezogen") {
    return NextResponse.json({ error: "Diese Einladung wurde zurückgezogen." }, { status: 410 });
  }
  if (state === "abgelaufen") {
    return NextResponse.json({ error: "Diese Einladung ist abgelaufen. Bitten Sie den Admin um eine neue." }, { status: 410 });
  }
  if (!emailMatchesInvitation(user.email, inv.email)) {
    return NextResponse.json(
      { error: `Diese Einladung gilt für ${inv.email}. Bitte melden Sie sich mit dieser Adresse an.` },
      { status: 403 },
    );
  }

  // Mitgliedschaft: neu anlegen oder reaktivieren. Ein bestehender Admin wird
  // durch eine Mitglieder-Einladung nicht zurückgestuft.
  const { data: existing } = await service
    .from("organization_members")
    .select("role")
    .eq("organization_id", inv.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = existing?.role === "admin" || inv.org_role === "admin" ? "admin" : "mitglied";
  const { error: memberErr } = existing
    ? await service
        .from("organization_members")
        .update({ role, deactivated_at: null })
        .eq("organization_id", inv.organization_id)
        .eq("user_id", user.id)
    : await service
        .from("organization_members")
        .insert({ organization_id: inv.organization_id, user_id: user.id, role });
  if (memberErr) {
    logError("[team/accept] Mitgliedschaft nicht gespeichert:", memberErr);
    return NextResponse.json({ error: "Die Einladung liess sich nicht annehmen." }, { status: 500 });
  }

  // Firmenzugänge: nur Firmen, die (noch) zur Organisation gehören.
  if (role === "mitglied" && isAccessRole(inv.company_role) && inv.company_ids.length > 0) {
    const { data: companies } = await service
      .from("companies")
      .select("id")
      .eq("organization_id", inv.organization_id)
      .in("id", inv.company_ids);
    const rows = (companies ?? []).map((c: { id: string }) => ({
      company_id: c.id,
      user_id: user.id,
      access_role: inv.company_role,
    }));
    if (rows.length > 0) {
      const { error: accessErr } = await service
        .from("company_members")
        .upsert(rows, { onConflict: "company_id,user_id" });
      if (accessErr) {
        logError("[team/accept] Firmenzugang nicht gespeichert:", accessErr);
        return NextResponse.json({ error: "Die Einladung liess sich nicht annehmen." }, { status: 500 });
      }
    }
  }

  await service
    .from("organization_invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by_user_id: user.id })
    .eq("id", inv.id);

  const orgName = Array.isArray(inv.organizations) ? inv.organizations[0]?.name : (inv.organizations as { name?: string } | null)?.name;
  return NextResponse.json({ ok: true, organization: orgName ?? null });
}
