import { NextRequest, NextResponse } from "next/server";

import { userIsCompanyMember } from "@/lib/auth/ownership";
import { createClient } from "@/lib/db/supabase-server";
import { pickCompanyFields } from "@/lib/company/payload";
import { logError } from "@/lib/log";

/**
 * PATCH /api/companies/[id]
 * Body: JSON mit den zu ändernden Feldern
 *
 * Ändert die Stammdaten einer Firma. Es werden ausschliesslich Felder
 * geschrieben, die im Rumpf der Anfrage vorkommen – siehe lib/company/payload.ts:
 * das Formular hat einen Kurzmodus, und ein pauschales Update würde dort
 * vorhandene Werte mit null überschreiben.
 */
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!(await userIsCompanyMember(supabase, id, user.id))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Kein gültiges JSON." }, { status: 400 });

  // Den bestehenden Stil mitgeben: nur so darf ein Marken-Theme unverändert
  // zurückgeschrieben werden, ohne dass es öffentlich wählbar wird.
  const { data: existing } = await supabase
    .from("companies")
    .select("default_certificate_font_family")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = pickCompanyFields(body, {
    currentTheme: existing?.default_certificate_font_family ?? null,
  });
  if (error) return NextResponse.json({ error }, { status: 400 });

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Keine änderbaren Felder übergeben." }, { status: 400 });
  }

  const { data: updated, error: dbError } = await supabase
    .from("companies")
    .update(data)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (dbError) {
    logError("[companies] Ändern fehlgeschlagen:", dbError);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!updated) {
    // Die Zeilensicherheit hat den Schreibzugriff verweigert, obwohl die Person
    // die Firma sehen darf. Das ist ein Rechtefall, kein Serverfehler.
    return NextResponse.json({ error: "Kein Schreibrecht auf diese Firma." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, id: updated.id });
}
