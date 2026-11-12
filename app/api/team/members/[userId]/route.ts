import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
import { isUuid, parseMemberUpdate } from "@/lib/team/invitations";
import { logError } from "@/lib/log";

/**
 * PATCH /api/team/members/[userId]
 * Body: { organizationId, orgRole?: 'admin'|'mitglied', active?: boolean,
 *         access?: { [companyId]: 'hr_leitung'|'hr'|'lesen'|null } }
 *
 * Ein Admin ändert Rolle, Status oder Firmenzugänge einer Person. Alles läuft
 * mit der Sitzung des Admins; die Zeilenregeln aus 033 lassen nur Admins der
 * Organisation schreiben. Die letzte aktive Admin-Person schützt ein Trigger
 * in der Datenbank – hier wird daraus eine verständliche Meldung.
 *
 * Austritt = active:false. Die Person verliert sofort jeden Zugriff, ihre
 * versiegelten Zeugnisse bleiben gültig (das Siegel trägt die Namen im Text,
 * nicht das Konto).
 */
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUuid(userId)) return NextResponse.json({ error: "Ungültige Person." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const parsed = parseMemberUpdate(await req.json().catch(() => null));
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.data;

  const { data: isAdmin } = await supabase.rpc("zeugnio_is_org_admin", { p_org_id: input.organizationId });
  if (!isAdmin) {
    return NextResponse.json({ error: "Das darf nur ein Admin der Organisation." }, { status: 403 });
  }

  if (input.orgRole !== undefined || input.active !== undefined) {
    const patch: Record<string, unknown> = {};
    if (input.orgRole !== undefined) patch.role = input.orgRole;
    if (input.active !== undefined) patch.deactivated_at = input.active ? null : new Date().toISOString();

    const { data, error } = await supabase
      .from("organization_members")
      .update(patch)
      .eq("organization_id", input.organizationId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) {
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "Die letzte Admin-Person lässt sich nicht entfernen. Machen Sie zuerst jemand anderen zum Admin." },
          { status: 409 },
        );
      }
      logError("[team/members] Änderung fehlgeschlagen:", error);
      return NextResponse.json({ error: "Die Änderung liess sich nicht speichern." }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Diese Person gehört nicht zur Organisation." }, { status: 404 });
    }
  }

  if (input.access) {
    const companyIds = Object.keys(input.access);
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", input.organizationId)
      .in("id", companyIds);
    if ((companies ?? []).length !== companyIds.length) {
      return NextResponse.json({ error: "Eine Firma gehört nicht zu dieser Organisation." }, { status: 400 });
    }

    const grant = Object.entries(input.access)
      .filter(([, role]) => role !== null)
      .map(([company_id, access_role]) => ({ company_id, user_id: userId, access_role }));
    const revoke = Object.entries(input.access)
      .filter(([, role]) => role === null)
      .map(([companyId]) => companyId);

    if (grant.length > 0) {
      const { error } = await supabase.from("company_members").upsert(grant, { onConflict: "company_id,user_id" });
      if (error) {
        logError("[team/members] Firmenzugang nicht gespeichert:", error);
        return NextResponse.json({ error: "Der Firmenzugang liess sich nicht speichern." }, { status: 500 });
      }
    }
    if (revoke.length > 0) {
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("user_id", userId)
        .in("company_id", revoke);
      if (error) {
        logError("[team/members] Firmenzugang nicht entfernt:", error);
        return NextResponse.json({ error: "Der Firmenzugang liess sich nicht entfernen." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
