import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import {
  deriveLegacyType,
  schlusssatzPreview,
  type SchlusssatzParams,
} from "@/lib/phrases/schlusssaetze";
import { tauscheImDoc, tauscheImText } from "@/lib/phrases/schlusssatz-tausch";
import { tiptapToPlainText } from "@/lib/certificate/tiptap-plaintext";
import { isCertificateLocked } from "@/lib/certificate/status";

/**
 * Persistiert die Schlusssatz-Steuerung der Detailseite (Christoph-Matrix):
 * Austrittsgrund, Wertschätzungsgrad und die Opt-ins. Aus Zeugnistyp + Opt-ins
 * wird der Legacy-`type` neu abgeleitet (deriveLegacyType), damit ein späteres
 * „Neu generieren" Intro/Tempus/Wechsel-Zweig und Schlusssatz konsistent bäckt.
 *
 * Liegt schon ein Zeugnistext vor, wird der Schlusssatz darin sofort getauscht
 * (generated_text und, falls bearbeitet, formatted_content/edited_text) – aber
 * nur, wo der bisherige Satz unverändert steht. `schlusssatzImText` meldet der
 * Steuerung, ob das geklappt hat.
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
    .select(
      "company_id, status, zeugnis_typ, austrittsgrund, wertschaetzungsgrad, optin_bedauern, optin_reorg, optin_vorgesetztenwechsel, optin_interner_wechsel, generated_text, edited_text, formatted_content, employees(first_name, last_name, gender)",
    )
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

  // Schlusssatz im vorhandenen Text tauschen: bisheriger Satz (aus dem
  // gespeicherten Stand) gegen den neuen.
  const textUpdate: Record<string, unknown> = {};
  let schlusssatzImText: "kein_text" | "unveraendert" | "getauscht" | "nicht_gefunden" =
    "kein_text";
  const person = Array.isArray(cert.employees) ? cert.employees[0] : cert.employees;
  if (cert.generated_text && person) {
    const subject = {
      firstName: person.first_name,
      lastName: person.last_name,
      gender: person.gender,
    };
    const altParams: SchlusssatzParams = {
      zeugnisTyp,
      austrittsgrund: cert.austrittsgrund ?? null,
      wertschaetzung: cert.wertschaetzungsgrad ?? null,
      optinBedauern: cert.optin_bedauern ?? false,
      optinReorg: cert.optin_reorg ?? false,
      optinVorgesetztenwechsel: cert.optin_vorgesetztenwechsel ?? false,
      optinInternerWechsel: cert.optin_interner_wechsel ?? false,
    };
    const neuParams: SchlusssatzParams = {
      zeugnisTyp,
      austrittsgrund,
      wertschaetzung: wertschaetzungsgrad,
      optinBedauern,
      optinReorg,
      optinVorgesetztenwechsel,
      optinInternerWechsel,
    };
    const alt = schlusssatzPreview(altParams, subject) ?? "";
    const neu = schlusssatzPreview(neuParams, subject) ?? "";

    if (alt === neu) {
      schlusssatzImText = "unveraendert";
    } else {
      const generated = tauscheImText(cert.generated_text, alt, neu);
      if (generated) textUpdate.generated_text = generated;

      // Sichtbar ist die Bearbeitung, falls vorhanden – sie entscheidet, ob der
      // Tausch für die Nutzerin «geklappt» hat.
      let sichtbarGetauscht = !!generated;
      if (cert.formatted_content) {
        const doc = tauscheImDoc(cert.formatted_content, alt, neu);
        if (doc) {
          textUpdate.formatted_content = doc;
          // Autoritative Projektion wie in PUT .../content.
          textUpdate.edited_text = tiptapToPlainText(doc);
        }
        sichtbarGetauscht = !!doc;
      } else if (cert.edited_text) {
        const edited = tauscheImText(cert.edited_text, alt, neu);
        if (edited) textUpdate.edited_text = edited;
        sichtbarGetauscht = !!edited;
      }
      schlusssatzImText = sichtbarGetauscht ? "getauscht" : "nicht_gefunden";
    }
  }

  const { error: saveErr } = await supabase
    .from("certificates")
    .update({
      ...textUpdate,
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

  return NextResponse.json({ ok: true, type, schlusssatzImText });
}
