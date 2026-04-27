import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { randomBytes } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { manager_email } = await req.json();

  if (!manager_email || !manager_email.includes("@")) {
    return NextResponse.json(
      { error: "Ungültige E-Mail-Adresse" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verifizieren, dass User Zugriff auf das Certificate hat
  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  // Token generieren
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 Tage

  const { error } = await supabase.from("manager_invitations").insert({
    certificate_id: id,
    manager_email,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status auf pending_manager setzen
  await supabase
    .from("certificates")
    .update({ status: "pending_manager" })
    .eq("id", id);

  // TODO: E-Mail mit Magic Link via Resend versenden.
  // Für MVP: Link in Antwort zurückgeben, sodass HR ihn manuell teilen kann.
  const inviteUrl = new URL(
    `/app/invitations/${token}`,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();

  return NextResponse.json({ ok: true, invite_url: inviteUrl });
}
