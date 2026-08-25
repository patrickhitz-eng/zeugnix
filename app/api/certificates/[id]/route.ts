import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";

/**
 * DELETE /api/certificates/[id]
 *
 * Löscht ein Zeugnis hart. Nur erlaubt, solange es NICHT finalisiert ist –
 * finalisierte Zeugnisse sind Rechtsdokumente und werden stattdessen
 * archiviert (siehe PATCH). Verbundene Datensätze (evaluations,
 * manager_invitations) hängen per ON DELETE CASCADE dran.
 */
export async function DELETE(
  _req: NextRequest,
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

  if (isCertificateLocked(cert.status)) {
    return NextResponse.json(
      {
        error:
          "Finalisierte oder widerrufene Zeugnisse können nicht gelöscht, nur archiviert werden.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("certificates").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/certificates/[id]
 *
 * Body: { archived: boolean }
 * Archiviert ein Zeugnis (blendet es aus) oder stellt es wieder her. Für jeden
 * Status erlaubt – auch finalisierte Zeugnisse dürfen archiviert werden.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { archived } = await req.json();

  if (typeof archived !== "boolean") {
    return NextResponse.json(
      { error: "Feld 'archived' (boolean) erforderlich" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("id, company_id")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const { error } = await supabase
    .from("certificates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, archived });
}
