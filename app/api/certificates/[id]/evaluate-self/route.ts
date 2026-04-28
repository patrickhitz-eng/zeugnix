import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

/**
 * POST /api/certificates/[id]/evaluate-self
 *
 * Erlaubt dem eingeloggten User (z.B. KMU-Inhaber, der gleichzeitig
 * Führungskraft ist), die Beurteilung direkt selbst zu erfassen,
 * ohne den Umweg über E-Mail-Einladung und Token-Link.
 *
 * Body: { evaluations: Array<{ category, rating, free_text? }> }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { evaluations } = await req.json();

  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return NextResponse.json(
      { error: "Keine Beurteilungen übermittelt" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verifizieren, dass User Zugriff auf das Certificate hat (RLS macht das,
  // aber wir wollen auch sicherstellen, dass die ID gültig ist)
  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json(
      { error: "Zeugnis nicht gefunden oder kein Zugriff" },
      { status: 404 },
    );

  // Bestehende Evaluations zu diesem Zeugnis löschen (idempotent: erneute
  // Selbst-Beurteilung überschreibt vorherige)
  await supabase.from("evaluations").delete().eq("certificate_id", id);

  // Neue Evaluations einfügen, mit User-E-Mail als Beurteiler
  const userEmail = user.email ?? "self";
  const rows = evaluations.map((e: any) => ({
    certificate_id: id,
    invitation_id: null, // keine Einladung, da Selbst-Beurteilung
    submitted_by_email: userEmail,
    category: e.category,
    subcategory: e.subcategory ?? null,
    rating: e.rating,
    free_text: e.free_text ?? null,
  }));

  const { error: insErr } = await supabase.from("evaluations").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Status auf manager_submitted setzen, damit der Generieren-Schritt freigeschaltet ist
  await supabase
    .from("certificates")
    .update({ status: "manager_submitted" })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
