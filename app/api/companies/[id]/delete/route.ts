import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { deleteCompanyLogos } from "@/lib/uploads/delete-company-logos";
import { deletionErrorStatus } from "@/lib/loeschen/rpc-error";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/**
 * POST /api/companies/[id]/delete   Body: { confirmName: string }
 *
 * Löscht eine Firma mit allen Mitarbeitenden und Zeugnissen (Schritt 17).
 * Ausgestellte Zeugnisse bleiben im Prüfregister ohne Personendaten. Recht und
 * Ablauf prüft die Datenbankfunktion zeugnio_delete_company (036): nur die
 * Admin-Person der Organisation. Die Bestätigung mit dem Firmennamen schützt
 * vor einem Fehlklick, nicht vor einem Angreifer.
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
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { confirmName?: unknown } | null;
  const { data: company } = await supabase.from("companies").select("name").eq("id", id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Firma nicht gefunden" }, { status: 404 });
  if (typeof body?.confirmName !== "string" || body.confirmName.trim() !== company.name.trim()) {
    return NextResponse.json({ error: "Bitte den Firmennamen genau so eingeben, wie er angezeigt wird." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("zeugnio_delete_company", { p_company_id: id });
  if (error) {
    const status = deletionErrorStatus(error);
    if (status === 500) logError("[loeschen] Firma nicht gelöscht:", error);
    return NextResponse.json({ error: status === 500 ? "Löschen fehlgeschlagen." : error.message }, { status });
  }

  await deleteCompanyLogos(createServiceClient(), data?.company_ids ?? [id], data?.logo_urls ?? []);
  return NextResponse.json({ ok: true, registered: data?.registered ?? 0 });
}
