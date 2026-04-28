import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

/**
 * PUT /api/certificates/[id]/text
 *
 * Speichert die manuelle Bearbeitung des Zeugnistexts.
 * Body: { edited_text: string | null }
 *  - String: speichert als bearbeiteter Text
 *  - null: löscht die Bearbeitung (zurück zu generated_text)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { edited_text } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json(
      { error: "Zeugnis nicht gefunden" },
      { status: 404 },
    );

  if (cert.status === "final") {
    return NextResponse.json(
      { error: "Finalisierte Zeugnisse können nicht mehr bearbeitet werden" },
      { status: 400 },
    );
  }

  const update: any = {
    edited_text: edited_text ?? null,
  };
  if (edited_text) {
    update.text_last_edited_at = new Date().toISOString();
    update.text_last_edited_by_user_id = user.id;
  } else {
    update.text_last_edited_at = null;
    update.text_last_edited_by_user_id = null;
  }

  const { error } = await supabase
    .from("certificates")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
