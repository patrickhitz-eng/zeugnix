import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { isSignatureMode } from "@/lib/certificate/signature-mode";

/**
 * Persistiert die zeugnis-spezifischen Unterzeichnenden (Override der
 * Firmenvorgabe). Pro Slot gilt: ist ein Name gesetzt, überschreibt er die
 * Firma für dieses Zeugnis; leer = Firmenvorgabe (siehe
 * lib/certificate/signatories.ts). Eine Rolle ohne Namen wird verworfen.
 *
 * Nach der Finalisierung ist der Inhalt eingefroren (Hash) – keine Änderung.
 */
export async function PATCH(
  req: NextRequest,
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
    .select("company_id, status")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (cert.status === "final")
    return NextResponse.json(
      { error: "Zeugnis ist finalisiert und kann nicht geändert werden." },
      { status: 409 },
    );

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  const trimOrNull = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Rolle ohne Namen ist bedeutungslos (Name ist der Anker) – dann Slot leeren.
  const name1 = trimOrNull(body.signatory1Name);
  const name2 = trimOrNull(body.signatory2Name);
  const role1 = name1 ? trimOrNull(body.signatory1Role) : null;
  const role2 = name2 ? trimOrNull(body.signatory2Role) : null;

  const update: Record<string, unknown> = {
    signatory_1_name: name1,
    signatory_1_role: role1,
    signatory_2_name: name2,
    signatory_2_role: role2,
  };

  // Unterschrifts-Modus ist optional; nur bei gültigem Wert übernehmen.
  if (body.signatureMode !== undefined) {
    if (!isSignatureMode(body.signatureMode))
      return NextResponse.json(
        { error: "Ungültiger Unterschrifts-Modus." },
        { status: 400 },
      );
    update.signature_mode = body.signatureMode;
  }

  const { error: saveErr } = await supabase
    .from("certificates")
    .update(update)
    .eq("id", id);

  if (saveErr)
    return NextResponse.json(
      { error: `Speichern fehlgeschlagen: ${saveErr.message}` },
      { status: 500 },
    );

  return NextResponse.json({ ok: true });
}
