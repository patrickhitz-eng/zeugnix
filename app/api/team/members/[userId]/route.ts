import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
import { permissionDeniedMessage } from "@/lib/auth/ownership";
import { isUuid, parseMemberUpdate, TEAM_MANAGER_ROLES } from "@/lib/team/invitations";
import { logError } from "@/lib/log";

/**
 * PATCH /api/team/members/[userId]
 * Body: { organizationId, orgRole?: 'admin'|'mitglied', active?: boolean,
 *         access?: { [companyId]: 'hr_leitung'|'hr'|'lesen'|null } }
 *
 * Ein Admin ändert Rolle, Status, Firmenzugänge oder Feinrechte einer Person.
 * Wer das Feinrecht «Team verwalten» hat (035), ändert nur Firmenzugänge in
 * seinen Firmen, und nur zwischen HR, Lesen und keinem Zugang. Alles läuft mit
 * der Sitzung; die Zeilenregeln aus 033 und 035 ziehen die Grenze. Die letzte
 * aktive Admin-Person schützt ein Trigger in der Datenbank – hier wird daraus
 * eine verständliche Meldung.
 *
 * Body zusätzlich: rights?: { [companyId]: { seal?: boolean|null, team?: boolean, company?: boolean } }
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
    // Feinrecht «Team verwalten» (035): nur Firmenzugänge, nur HR oder Lesen,
    // nur in Firmen mit diesem Recht, nie die eigene Zeile. Die Zeilenregeln
    // aus 035 ziehen dieselbe Grenze; hier entstehen die klaren Meldungen.
    if (input.orgRole !== undefined || input.active !== undefined || input.rights !== undefined || !input.access) {
      return NextResponse.json({ error: "Das darf nur ein Admin der Organisation." }, { status: 403 });
    }
    if (userId === user.id) {
      return NextResponse.json({ error: "Die eigenen Rechte ändert der Admin der Organisation." }, { status: 403 });
    }
    for (const [companyId, role] of Object.entries(input.access)) {
      if (role !== null && !TEAM_MANAGER_ROLES.includes(role)) {
        return NextResponse.json({ error: "Sie können nur die Rollen HR und Lesen vergeben." }, { status: 403 });
      }
      const { data: canManage } = await supabase.rpc("zeugnio_can_manage_team", { p_company_id: companyId });
      if (!canManage) {
        return NextResponse.json({ error: permissionDeniedMessage("team") }, { status: 403 });
      }
    }
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

    // Wer auf «Lesen» geht, verliert eine Versiegel-Abweichung: Lesen kann
    // ohnehin nicht finalisieren (Check-Regel in 035).
    const grant = Object.entries(input.access)
      .filter(([, role]) => role !== null)
      .map(([company_id, access_role]) =>
        access_role === "lesen"
          ? { company_id, user_id: userId, access_role, seal_override: null }
          : { company_id, user_id: userId, access_role },
      );
    const revoke = Object.entries(input.access)
      .filter(([, role]) => role === null)
      .map(([companyId]) => companyId);

    if (grant.length > 0) {
      const { error } = await supabase.from("company_members").upsert(grant, { onConflict: "company_id,user_id" });
      if (error) {
        if (error.code === "42501") {
          return NextResponse.json(
            { error: "Diese Person hat Rechte, die nur der Admin der Organisation ändern kann." },
            { status: 403 },
          );
        }
        logError("[team/members] Firmenzugang nicht gespeichert:", error);
        return NextResponse.json({ error: "Der Firmenzugang liess sich nicht speichern." }, { status: 500 });
      }
    }
    if (revoke.length > 0) {
      const { data: removed, error } = await supabase
        .from("company_members")
        .delete()
        .eq("user_id", userId)
        .in("company_id", revoke)
        .select("company_id");
      if (error) {
        logError("[team/members] Firmenzugang nicht entfernt:", error);
        return NextResponse.json({ error: "Der Firmenzugang liess sich nicht entfernen." }, { status: 500 });
      }
      // Ohne Admin verhindert die Zeilenregel stumm das Löschen geschützter Zeilen.
      if (!isAdmin && (removed ?? []).length < revoke.length) {
        return NextResponse.json(
          { error: "Diese Person hat Rechte, die nur der Admin der Organisation ändern kann." },
          { status: 403 },
        );
      }
    }
  }

  // Feinrechte (035): nur die Admin-Person, und nur auf bestehende Zugänge.
  if (input.rights) {
    const companyIds = Object.keys(input.rights);
    const { data: rows } = await supabase
      .from("company_members")
      .select("company_id, access_role, companies!inner(organization_id)")
      .eq("user_id", userId)
      .in("company_id", companyIds)
      .eq("companies.organization_id", input.organizationId);
    const roleByCompany = new Map((rows ?? []).map((r: any) => [r.company_id as string, r.access_role as string]));

    for (const [companyId, r] of Object.entries(input.rights)) {
      const role = roleByCompany.get(companyId);
      if (!role) {
        return NextResponse.json(
          { error: "Feinrechte gibt es nur für Firmen, auf die die Person Zugriff hat." },
          { status: 400 },
        );
      }
      if (r.seal !== undefined && r.seal !== null && role === "lesen") {
        return NextResponse.json(
          { error: "Mit der Rolle «Lesen» lässt sich nicht versiegeln. Wählen Sie zuerst HR oder HR-Leitung." },
          { status: 400 },
        );
      }
      const patch: Record<string, unknown> = {};
      if (r.seal !== undefined) patch.seal_override = r.seal;
      if (r.team !== undefined) patch.may_manage_team = r.team;
      if (r.company !== undefined) patch.may_edit_company = r.company;

      const { data: updated, error } = await supabase
        .from("company_members")
        .update(patch)
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .select("company_id");
      if (error) {
        logError("[team/members] Feinrechte nicht gespeichert:", error);
        return NextResponse.json({ error: "Die Feinrechte liessen sich nicht speichern." }, { status: 500 });
      }
      if (!updated || updated.length === 0) {
        return NextResponse.json({ error: "Die Feinrechte liessen sich nicht speichern." }, { status: 403 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
