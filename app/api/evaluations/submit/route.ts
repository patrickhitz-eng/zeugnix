import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { token, evaluations } = await req.json();

    if (!token || !Array.isArray(evaluations)) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Invitation per Token validieren
    const { data: inv } = await supabase
      .from("manager_invitations")
      .select("*")
      .eq("token", token)
      .single();

    if (!inv) {
      return NextResponse.json(
        { error: "Einladung nicht gefunden" },
        { status: 404 },
      );
    }

    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: "Einladung abgelaufen" }, { status: 410 });
    }

    if (inv.status === "submitted") {
      return NextResponse.json(
        { error: "Beurteilung wurde bereits abgegeben" },
        { status: 409 },
      );
    }

    // Bestehende Evaluations zu diesem Zeugnis löschen (idempotent)
    await supabase.from("evaluations").delete().eq("certificate_id", inv.certificate_id);

    // Neue Evaluations einfügen
    const rows = evaluations.map((e: any) => ({
      certificate_id: inv.certificate_id,
      invitation_id: inv.id,
      submitted_by_email: inv.manager_email,
      category: e.category,
      subcategory: e.subcategory ?? null,
      rating: e.rating,
      free_text: e.free_text ?? null,
    }));

    const { error: insErr } = await supabase.from("evaluations").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Invitation als submitted markieren
    await supabase
      .from("manager_invitations")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", inv.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
