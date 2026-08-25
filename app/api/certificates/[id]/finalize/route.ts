import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { canonicalizeForHash, sha256 } from "@/lib/hash/canonicalize";

export async function POST(
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
    .select("*, employees(*), companies(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (!cert.generated_text) {
    return NextResponse.json(
      { error: "Zeugnistext muss zuerst generiert werden." },
      { status: 400 },
    );
  }

  if (cert.status === "final") {
    return NextResponse.json(
      { error: "Zeugnis ist bereits finalisiert." },
      { status: 400 },
    );
  }

  if (cert.status === "revoked") {
    return NextResponse.json(
      { error: "Widerrufene Zeugnisse können nicht erneut finalisiert werden." },
      { status: 400 },
    );
  }

  // Hash über den TATSÄCHLICH gedruckten Body bilden – exakt dieselbe Quelle
  // wie das PDF (app/api/certificates/[id]/pdf/route.ts) und dieselbe
  // Pipeline wie die Verifikation (canonicalizeForHash). Datum/Ort sind als
  // letzter Absatz Teil des Body, daher kein separates (flüchtiges) Datum.
  const bodyText = cert.edited_text || cert.generated_text || "";
  const canonicalString = canonicalizeForHash(bodyText);
  const hash = await sha256(canonicalString);

  // Kritischer Schreibvorgang: schlägt er fehl, darf NICHT ok:true zurück –
  // sonst meldet die UI "finalisiert", obwohl Hash/Status nicht gespeichert sind.
  const { error: finalizeErr } = await supabase
    .from("certificates")
    .update({
      hash,
      canonical_content: canonicalString,
      status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (finalizeErr) {
    return NextResponse.json(
      { error: `Finalisierung konnte nicht gespeichert werden: ${finalizeErr.message}` },
      { status: 500 },
    );
  }

  // Employer-Badge ist sekundär (kosmetisch): Fehler hier dürfen die bereits
  // erfolgreiche Finalisierung nicht zunichtemachen – nur protokollieren.
  if (cert.company_id) {
    const { error: badgeUpdateErr } = await supabase
      .from("companies")
      .update({ has_employer_badge: true })
      .eq("id", cert.company_id);
    if (badgeUpdateErr) {
      console.warn("[finalize] Employer-Badge-Update fehlgeschlagen:", badgeUpdateErr.message);
    }

    // Idempotent insert in employer_badges
    const { error: badgeUpsertErr } = await supabase
      .from("employer_badges")
      .upsert(
        { company_id: cert.company_id, badge_type: "verified_certificate_employer", active: true },
        { onConflict: "company_id,badge_type", ignoreDuplicates: true },
      );
    if (badgeUpsertErr) {
      console.warn("[finalize] Employer-Badge-Upsert fehlgeschlagen:", badgeUpsertErr.message);
    }
  }

  return NextResponse.json({ ok: true, hash });
}
