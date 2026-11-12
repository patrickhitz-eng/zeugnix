import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
import { isUuid } from "@/lib/team/invitations";

/**
 * DELETE /api/team/invitations/[id]
 *
 * Zieht eine offene Einladung zurück. Gelöscht wird nichts: revoked_at bleibt
 * als Spur stehen. Die Zeilenregel aus 033 lässt das nur Admins der
 * Organisation zu; für alle anderen ändert sich keine Zeile.
 */
export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Ungültige Einladung." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { data, error } = await supabase
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Keine offene Einladung gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
