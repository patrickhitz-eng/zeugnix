import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { pickCompanyFields } from "@/lib/company/payload";
import { logError } from "@/lib/log";

/**
 * POST /api/companies
 * Body: JSON mit den Stammdaten der Firma
 *
 * Legt eine Firma an. Bisher tat das der Browser direkt über PostgREST
 * (components/forms/company-form.tsx). Der Weg über eine Server-Route ist die
 * Voraussetzung dafür, dass die Daten-API auf dem eigenen Server nur auf
 * 127.0.0.1 lauscht und nie ins Internet muss – und damit weder einen eigenen
 * Hostnamen noch ein Zertifikat noch CORS braucht.
 *
 * Geschrieben wird mit dem Dienstkonto (Begründung unten beim insert). Wer
 * anlegen darf, entscheidet der Trigger zeugnio_company_assign_org (033)
 * anhand von created_by_user_id aus der Sitzung.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Kein gültiges JSON." }, { status: 400 });

  const { data, error } = pickCompanyFields(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!data.name) return NextResponse.json({ error: "Der Firmenname ist Pflicht." }, { status: 400 });

  // Angelegt wird mit dem Dienstkonto, nicht mit der Sitzung. Grund: Mit der
  // Sitzung scheitert das Zurücklesen der neuen ID an der Leseregel
  // («Members can view companies» → zeugnio_company_role). Diese Funktion ist
  // STABLE und sieht die Zeile, die derselbe Befehl gerade einfügt, noch
  // nicht; Postgres meldet dann «new row violates row-level security policy»
  // (seit Migration 033 bei jeder neuen Firma, gefunden 24.11.2026).
  //
  // Die Rechte prüft trotzdem die Datenbank: Der Trigger
  // zeugnio_company_assign_org nimmt bei fehlendem auth.uid() die Person aus
  // created_by_user_id, und die kommt hier aus der Sitzung, nie aus der Anfrage.
  // Eingeladene Mitglieder ohne Admin-Recht lehnt er weiter ab (42501).
  // organization_id lässt pickCompanyFields nicht durch, die Organisation
  // bestimmt also immer der Trigger.
  const { data: created, error: dbError } = await createServiceClient()
    .from("companies")
    .insert({ ...data, created_by_user_id: user.id })
    .select("id")
    .single();

  // Der Trigger aus Migration 033 lehnt ab, wenn ein eingeladenes Mitglied
  // ohne Admin-Recht eine Firma anlegen will (42501). Das ist kein Serverfehler.
  if (dbError?.code === "42501") {
    return NextResponse.json({ error: dbError.message }, { status: 403 });
  }
  if (dbError || !created) {
    logError("[companies] Anlegen fehlgeschlagen:", dbError);
    return NextResponse.json(
      { error: dbError?.message ?? "Die Firma liess sich nicht anlegen." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
