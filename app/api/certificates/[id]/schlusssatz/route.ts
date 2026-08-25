import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { deriveLegacyType } from "@/lib/phrases/schlusssaetze";
import { isCertificateLocked } from "@/lib/certificate/status";

/**
 * Persistiert die Schlusssatz-Steuerung der Detailseite (Christoph-Matrix):
 * Austrittsgrund, Wertschätzungsgrad und die Opt-ins. Aus Zeugnistyp + Opt-ins
 * wird der Legacy-`type` neu abgeleitet (deriveLegacyType), damit ein späteres
 * „Neu generieren" Intro/Tempus/Wechsel-Zweig und Schlusssatz konsistent bäckt.
 *
 * Bewusst NICHT gesetzt wird `zeugnis_typ` – der Zeugnistyp bleibt auf Schritt 1
 * gewählt und wird hier nicht verändert.
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
    .select("company_id, status, zeugnis_typ")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  // Nach der Finalisierung ist der Inhalt eingefroren (Hash) – keine Änderung.
  // Gilt genauso nach einem Widerruf (H2): 'revoked' ist ebenfalls ein
  // Endzustand, keine weniger strenge Sperre als 'final'.
  if (isCertificateLocked(cert.status))
    return NextResponse.json(
      { error: "Zeugnis ist finalisiert oder widerrufen und kann nicht geändert werden." },
      { status: 409 },
    );

  const zeugnisTyp = (cert.zeugnis_typ ?? "schluss") as
    | "schluss"
    | "zwischen"
    | "arbeitsbestaetigung";

  // Schlusssatz-Optionen gibt es nur bei schluss/zwischen.
  if (zeugnisTyp === "arbeitsbestaetigung")
    return NextResponse.json(
      { error: "Arbeitsbestätigung hat keinen Schlusssatz." },
      { status: 400 },
    );

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  const validGrund = ["wunsch_an", "wunsch_ag", "einvernehmen"];
  const validGrad = ["standard", "wertschaetzender", "top"];

  const austrittsgrund =
    zeugnisTyp === "schluss" && validGrund.includes(body.austrittsgrund)
      ? body.austrittsgrund
      : null;
  const wertschaetzungsgrad = validGrad.includes(body.wertschaetzung)
    ? body.wertschaetzung
    : "standard";
  const optinBedauern = zeugnisTyp === "schluss" && !!body.optinBedauern;
  const optinReorg = !!body.optinReorg;
  const optinVorgesetztenwechsel =
    zeugnisTyp === "zwischen" && !!body.optinVorgesetztenwechsel;
  const optinInternerWechsel =
    zeugnisTyp === "zwischen" && !!body.optinInternerWechsel;

  const type = deriveLegacyType(zeugnisTyp, {
    optinReorg,
    optinVorgesetztenwechsel,
    optinInternerWechsel,
  });

  const showWechsel = optinVorgesetztenwechsel || optinInternerWechsel;
  const trimOrNull = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const { error: saveErr } = await supabase
    .from("certificates")
    .update({
      type,
      austrittsgrund,
      wertschaetzungsgrad,
      optin_bedauern: optinBedauern,
      optin_reorg: optinReorg,
      optin_vorgesetztenwechsel: optinVorgesetztenwechsel,
      optin_interner_wechsel: optinInternerWechsel,
      // Wechsel-Detailfelder nur bei aktivem Wechsel-Opt-in behalten.
      new_function_title: showWechsel ? trimOrNull(body.newFunctionTitle) : null,
      new_company_name: showWechsel ? trimOrNull(body.newCompanyName) : null,
      transition_date: showWechsel ? trimOrNull(body.transitionDate) : null,
    })
    .eq("id", id);

  if (saveErr)
    return NextResponse.json(
      { error: `Speichern fehlgeschlagen: ${saveErr.message}` },
      { status: 500 },
    );

  return NextResponse.json({ ok: true, type });
}
