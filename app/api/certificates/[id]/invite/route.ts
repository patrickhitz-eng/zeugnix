import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email/send";
import { buildManagerInvitationEmail } from "@/lib/email/templates";

// Versendet eine E-Mail → Rate-Limit gegen Mail-Spam/Abuse.
const INVITE_LIMIT = 10;
const INVITE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { manager_email, manager_name } = await req.json();

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

  // Rate-Limit pro authentifiziertem User (nicht pro IP): ein HR-Team hinter
  // gemeinsamem NAT soll sich nicht ein Limit teilen. Greift vor dem teuren
  // E-Mail-Versand; das vorgelagerte getUser() ist günstig.
  const limited = await rateLimit(`invite:${user.id}`, INVITE_LIMIT, INVITE_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  // Zeugnis + Mitarbeitende + Firma laden für Mail-Inhalt
  const { data: cert } = await supabase
    .from("certificates")
    .select("id, status, company_id, employees(first_name, last_name), companies(name)")
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const employee: any = cert.employees;
  const company: any = cert.companies;
  if (!employee || !company) {
    return NextResponse.json(
      {
        error:
          "Zeugnis ist nicht vollständig verknüpft (Mitarbeitende oder Firma fehlt).",
      },
      { status: 400 },
    );
  }
  const employeeName = `${employee.first_name} ${employee.last_name}`;
  const companyName = company.name;

  // Token generieren
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 Tage

  const { error } = await supabase.from("manager_invitations").insert({
    certificate_id: id,
    manager_email,
    manager_name: manager_name ?? null,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status auf pending_manager setzen. Die Einladung wurde bereits gespeichert
  // und die E-Mail ist das eigentliche Ergebnis – ein Fehler hier ist nicht
  // fatal, wird aber protokolliert (sonst stiller Status-Verlust).
  const { error: statusErr } = await supabase
    .from("certificates")
    .update({ status: "pending_manager" })
    .eq("id", id);
  if (statusErr) {
    console.warn("[invite] Status-Update fehlgeschlagen:", statusErr.message);
  }

  // Profil des HR-Senders laden für persönliche Anrede in der Mail
  const { data: hrProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const inviteUrl = new URL(
    `/app/invitations/${token}`,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();

  // E-Mail senden via Resend
  const mail = buildManagerInvitationEmail({
    managerName: manager_name,
    employeeName,
    companyName,
    hrSenderName: hrProfile?.full_name ?? undefined,
    hrSenderEmail: hrProfile?.email ?? user.email ?? undefined,
    inviteUrl,
    expiresAt,
  });

  const sendResult = await sendEmail({
    to: manager_email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  // Antwort: ok = Mail wurde versendet, sonst Link für manuelle Weitergabe
  return NextResponse.json({
    ok: true,
    email_sent: sendResult.sent,
    email_id: sendResult.id,
    email_error: sendResult.error,
    invite_url: inviteUrl, // immer zurückgeben als Fallback / zum Anzeigen
    expires_at: expiresAt.toISOString(),
  });
}
