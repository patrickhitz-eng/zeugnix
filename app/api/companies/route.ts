import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
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
 * Geschrieben wird mit der Sitzung der angemeldeten Person. Die
 * Zeilensicherheit in der Datenbank bleibt damit die Grenze; diese Route fügt
 * nur Prüfungen hinzu, sie ersetzt keine.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Kein gültiges JSON." }, { status: 400 });

  const { data, error } = pickCompanyFields(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!data.name) return NextResponse.json({ error: "Der Firmenname ist Pflicht." }, { status: 400 });

  const { data: created, error: dbError } = await supabase
    .from("companies")
    // created_by_user_id kommt aus der Sitzung, nie aus dem Rumpf der Anfrage.
    .insert({ ...data, created_by_user_id: user.id })
    .select("id")
    .single();

  if (dbError || !created) {
    logError("[companies] Anlegen fehlgeschlagen:", dbError);
    return NextResponse.json(
      { error: dbError?.message ?? "Die Firma liess sich nicht anlegen." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
