import { NextRequest, NextResponse } from "next/server";

import { userIsCompanyMember } from "@/lib/auth/ownership";
import { createClient } from "@/lib/db/supabase-server";
import { deriveLegacyType } from "@/lib/phrases/schlusssaetze";
import { logError } from "@/lib/log";

/**
 * POST /api/certificates
 *
 * Legt eine Mitarbeiterin oder einen Mitarbeiter und dazu ein Zeugnis im Status
 * "draft" an. Bisher tat das der Browser in zwei Schritten direkt über PostgREST
 * (components/forms/new-certificate-form.tsx).
 *
 * Zwei Verbesserungen gegenüber dem bisherigen Weg, beide unabhängig vom Umzug:
 *
 *  - Scheitert der zweite Schritt, wird der erste zurückgenommen. Bisher blieb in
 *    diesem Fall eine Mitarbeiterin ohne Zeugnis in der Datenbank zurück – mit
 *    Namen, Geburtsdatum und Funktion, also mit Personendaten, die niemand mehr
 *    braucht und die die Löschfristen aus Migration 022 nie erfassen.
 *  - Der Zeugnistyp wird hier abgeleitet und nicht vom Browser übernommen.
 *
 * Geschrieben wird mit der Sitzung der angemeldeten Person; die
 * Zeilensicherheit bleibt die eigentliche Grenze.
 */
export const runtime = "nodejs";

const ZEUGNIS_TYPEN = ["schluss", "zwischen", "arbeitsbestaetigung"] as const;
type ZeugnisTyp = (typeof ZEUGNIS_TYPEN)[number];

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function tasksFrom(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Kein gültiges JSON." }, { status: 400 });

  const companyId = text(body.company_id);
  if (!companyId) return NextResponse.json({ error: "Firma fehlt." }, { status: 400 });

  if (!(await userIsCompanyMember(supabase, companyId, user.id))) {
    return NextResponse.json({ error: "Kein Zugriff auf diese Firma." }, { status: 403 });
  }

  const zeugnisTyp = text(body.zeugnis_typ) as ZeugnisTyp | null;
  if (!zeugnisTyp || !ZEUGNIS_TYPEN.includes(zeugnisTyp)) {
    return NextResponse.json({ error: "Unbekannter Zeugnistyp." }, { status: 400 });
  }

  const firstName = text(body.first_name);
  const lastName = text(body.last_name);
  const gender = text(body.gender);
  const functionTitle = text(body.function_title);
  const entryDate = text(body.entry_date);

  const fehlend = [
    !firstName && "Vorname",
    !lastName && "Nachname",
    !gender && "Anrede",
    !functionTitle && "Funktion",
    !entryDate && "Eintrittsdatum",
  ].filter(Boolean);
  if (fehlend.length > 0) {
    return NextResponse.json({ error: `Pflichtfelder fehlen: ${fehlend.join(", ")}.` }, { status: 400 });
  }

  const percentageRaw = Number.parseInt(String(body.employment_percentage ?? ""), 10);
  const percentage =
    Number.isInteger(percentageRaw) && percentageRaw > 0 && percentageRaw <= 100 ? percentageRaw : 100;

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      company_id: companyId,
      first_name: firstName,
      last_name: lastName,
      gender,
      date_of_birth: text(body.date_of_birth),
      function_title: functionTitle,
      entry_date: entryDate,
      exit_date: text(body.exit_date),
      employment_percentage: percentage,
      is_manager: body.is_manager === true || body.is_manager === "on",
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    logError("[certificates] Mitarbeitende nicht anlegbar:", employeeError);
    return NextResponse.json(
      { error: employeeError?.message ?? "Die Mitarbeiterin liess sich nicht anlegen." },
      { status: 500 },
    );
  }

  // Der Legacy-Typ folgt aus dem Zeugnistyp; neue Zeugnisse starten ohne Opt-ins.
  const legacyType = deriveLegacyType(zeugnisTyp, {});

  const { data: certificate, error: certificateError } = await supabase
    .from("certificates")
    .insert({
      company_id: companyId,
      employee_id: employee.id,
      type: legacyType,
      zeugnis_typ: zeugnisTyp,
      // Vorgaben für den Schlusssatz; auf der Detailseite anpassbar.
      austrittsgrund: zeugnisTyp === "schluss" ? "wunsch_an" : null,
      optin_bedauern: false,
      optin_reorg: false,
      optin_vorgesetztenwechsel: false,
      optin_interner_wechsel: false,
      wertschaetzungsgrad: "standard",
      tasks: tasksFrom(body.tasks),
      status: "draft",
      // Der Dank ist im Schlusssatz-Katalog bereits enthalten.
      thank_employee: zeugnisTyp === "schluss",
      new_function_title: null,
      new_company_name: null,
      transition_date: null,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (certificateError || !certificate) {
    logError("[certificates] Zeugnis nicht anlegbar:", certificateError);
    // Die eben angelegte Mitarbeiterin wieder entfernen. Gelingt auch das nicht,
    // wird es protokolliert: dann liegen Personendaten ohne Zweck in der
    // Datenbank, und das gehört bemerkt.
    const { error: rollbackError } = await supabase.from("employees").delete().eq("id", employee.id);
    if (rollbackError) {
      logError(
        "[certificates] Rücknahme der Mitarbeitenden fehlgeschlagen – verwaiste Personendaten:",
        rollbackError,
      );
    }
    return NextResponse.json(
      { error: certificateError?.message ?? "Das Zeugnis liess sich nicht anlegen." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: certificate.id }, { status: 201 });
}
