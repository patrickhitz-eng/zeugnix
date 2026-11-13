import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { deleteCompanyLogos } from "@/lib/uploads/delete-company-logos";
import { deletionErrorStatus } from "@/lib/loeschen/rpc-error";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/**
 * POST /api/team/organization/delete   Body: { organizationId, confirmName }
 *
 * Löscht die ganze Organisation: alle Firmen, Mitarbeitenden, Zeugnisse,
 * Mitgliedschaften und Einladungen (Schritt 17, Vertragsende). Ausgestellte
 * Zeugnisse bleiben im Prüfregister. Nur die Admin-Person; das prüft
 * zeugnio_delete_organization (036).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { organizationId?: unknown; confirmName?: unknown } | null;
  const orgId = typeof body?.organizationId === "string" ? body.organizationId : "";
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  if (!org) return NextResponse.json({ error: "Organisation nicht gefunden" }, { status: 404 });
  if (typeof body?.confirmName !== "string" || body.confirmName.trim() !== String(org.name).trim()) {
    return NextResponse.json({ error: "Bitte den Namen der Organisation genau so eingeben, wie er angezeigt wird." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("zeugnio_delete_organization", { p_org_id: orgId });
  if (error) {
    const status = deletionErrorStatus(error);
    if (status === 500) logError("[loeschen] Organisation nicht gelöscht:", error);
    return NextResponse.json({ error: status === 500 ? "Löschen fehlgeschlagen." : error.message }, { status });
  }

  await deleteCompanyLogos(createServiceClient(), data?.company_ids ?? [], data?.logo_urls ?? []);
  return NextResponse.json({ ok: true, registered: data?.registered ?? 0 });
}
