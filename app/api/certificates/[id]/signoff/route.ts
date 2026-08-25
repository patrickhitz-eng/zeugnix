import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email/send";
import { buildSignoffRequestEmail } from "@/lib/email/templates";

// Versendet eine E-Mail → Rate-Limit gegen Mail-Spam/Abuse.
export const runtime = "nodejs";
const SIGNOFF_LIMIT = 20;
const SIGNOFF_WINDOW_MS = 60 * 60 * 1000;

/**
 * POST /api/certificates/[id]/signoff
 * Body: { slot: 1 | 2, email: string }
 *
 * Fordert die identitaetsgebundene Freigabe (V2) einer benannten unterzeichnenden
 * Person an: erzeugt einen Token, speichert die Freigabe-Zeile und schickt der
 * Person einen Magic-Link. Name/Rolle werden serverseitig aus den effektiven
 * Unterzeichnenden uebernommen (Client bestimmt sie nicht). Schreiben laeuft
 * ueber den Service-Client NACH dem Ownership-Check — `authenticated` hat auf
 * certificate_signoffs keine Schreib-RLS (Migration 020).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit(`signoff:${user.id}`, SIGNOFF_LIMIT, SIGNOFF_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const slot = Number((body as { slot?: number }).slot);
  const email = ((body as { email?: string }).email ?? "").trim();

  if (slot !== 1 && slot !== 2) {
    return NextResponse.json({ error: "Ungültiger Unterschrifts-Slot." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ungültige E-Mail-Adresse." }, { status: 400 });
  }

  const { data: cert } = await supabase
    .from("certificates")
    .select(
      "id, company_id, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role, employees(first_name, last_name), companies(name, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role)",
    )
    .eq("id", id)
    .single();
  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const employee: any = Array.isArray(cert.employees) ? cert.employees[0] : cert.employees;
  const company: any = Array.isArray(cert.companies) ? cert.companies[0] : cert.companies;
  if (!employee || !company) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht vollständig verknüpft (Mitarbeitende oder Firma fehlt)." },
      { status: 400 },
    );
  }

  // Name/Rolle des Slots serverseitig auflösen (Zeugnis-Override ⟶ Firmenvorgabe).
  const signatories = resolveSignatories(cert, company);
  const slotName = slot === 1 ? signatories.signatory_1_name : signatories.signatory_2_name;
  const slotRole = slot === 1 ? signatories.signatory_1_role : signatories.signatory_2_role;
  if (!slotName) {
    return NextResponse.json(
      { error: `Für Unterschrift ${slot} ist keine unterzeichnende Person hinterlegt.` },
      { status: 400 },
    );
  }

  const employeeName = `${employee.first_name} ${employee.last_name}`;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 Tage

  const svc = createServiceClient();
  const { error: upErr } = await svc.from("certificate_signoffs").upsert(
    {
      certificate_id: id,
      slot,
      email,
      name: slotName,
      role: slotRole,
      token,
      status: "pending",
      sent_at: new Date().toISOString(),
      // Bei erneutem Anfordern eine evtl. alte Bestätigung zurücksetzen.
      viewed_at: null,
      confirmed_at: null,
      confirmed_ip: null,
      confirmed_user_agent: null,
      expires_at: expiresAt.toISOString(),
      created_by_user_id: user.id,
    },
    { onConflict: "certificate_id,slot" },
  );
  if (upErr) {
    return NextResponse.json(
      { error: `Freigabe konnte nicht angelegt werden: ${upErr.message}` },
      { status: 500 },
    );
  }

  // HR-Absender für die persönliche Anrede.
  const { data: hrProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const signoffUrl = new URL(
    `/app/signoffs/${token}`,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();

  const mail = buildSignoffRequestEmail({
    signatoryName: slotName,
    signatoryRole: slotRole ?? undefined,
    employeeName,
    companyName: company.name,
    hrSenderName: hrProfile?.full_name ?? undefined,
    hrSenderEmail: hrProfile?.email ?? user.email ?? undefined,
    signoffUrl,
    expiresAt,
  });

  const sendResult = await sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  return NextResponse.json({
    ok: true,
    slot,
    email,
    email_sent: sendResult.sent,
    email_error: sendResult.error,
    signoff_url: signoffUrl, // Fallback zum manuellen Weitergeben.
    expires_at: expiresAt.toISOString(),
  });
}
