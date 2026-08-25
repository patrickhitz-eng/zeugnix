import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { tiptapToPlainText } from "@/lib/certificate/tiptap-plaintext";
import { isCertificateLocked } from "@/lib/certificate/status";

/**
 * PUT /api/certificates/[id]/content
 *
 * Speichert den formatierten Zeugnis-Body (Tiptap-JSON) UND die daraus
 * abgeleitete Klartext-Projektion atomar.
 *
 * Body: { formatted_content: <TiptapJSON> | null }
 *  - JSON: speichert formatted_content; edited_text wird SERVER-AUTORITATIV aus
 *    dem JSON neu berechnet (Client-Wert wird ignoriert) -> Formatierung kann
 *    die Hash-Quelle nie verfälschen.
 *  - null: Reset auf den generierten Text (beide Felder werden geleert).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { formatted_content } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status, company_id")
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json(
      { error: "Zeugnis nicht gefunden" },
      { status: 404 },
    );

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (isCertificateLocked(cert.status)) {
    return NextResponse.json(
      { error: "Finalisierte oder widerrufene Zeugnisse können nicht mehr bearbeitet werden" },
      { status: 400 },
    );
  }

  const update: any = {};
  if (formatted_content == null) {
    update.formatted_content = null;
    update.edited_text = null;
    update.text_last_edited_at = null;
    update.text_last_edited_by_user_id = null;
  } else {
    update.formatted_content = formatted_content;
    // Autoritative Projektion: edited_text (= Hash-Quelle) aus dem JSON.
    update.edited_text = tiptapToPlainText(formatted_content);
    update.text_last_edited_at = new Date().toISOString();
    update.text_last_edited_by_user_id = user.id;
  }

  const { error } = await supabase
    .from("certificates")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
