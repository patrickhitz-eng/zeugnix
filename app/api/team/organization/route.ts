import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
import { isUuid } from "@/lib/team/invitations";

/**
 * PATCH /api/team/organization
 * Body: { organizationId, name?, inviteDomainOnly? }
 *
 * Name der Organisation und die Einstellung «nur Firmendomain einladen».
 * Die Zeilenregel aus 033 lässt nur Admins der Organisation ändern.
 */
export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isUuid(body.organizationId)) {
    return NextResponse.json({ error: "Organisation fehlt." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) return NextResponse.json({ error: "Bitte einen Namen angeben." }, { status: 400 });
    patch.name = name;
  }
  if (body.inviteDomainOnly !== undefined) {
    if (typeof body.inviteDomainOnly !== "boolean") {
      return NextResponse.json({ error: "Ungültige Einstellung." }, { status: 400 });
    }
    patch.invite_domain_only = body.inviteDomainOnly;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nichts zu ändern." }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", body.organizationId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Das darf nur ein Admin der Organisation." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
