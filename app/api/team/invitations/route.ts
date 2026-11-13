import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/db/supabase-server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { buildTeamInvitationEmail } from "@/lib/email/templates";
import { COMPANY_ROLE_LABEL, permissionDeniedMessage } from "@/lib/auth/ownership";
import { emailDomain } from "@/lib/company/domain";
import {
  INVITATION_DAYS,
  newInvitationToken,
  parseInvitationInput,
  TEAM_MANAGER_ROLES,
} from "@/lib/team/invitations";
import { logError } from "@/lib/log";

/**
 * POST /api/team/invitations
 * Body: { organizationId, email, role: 'admin'|'hr_leitung'|'hr'|'lesen', companyIds: [] }
 *
 * Ein Admin lädt eine Person in die Organisation ein. Seit 035 darf das auch,
 * wer in den gewählten Firmen das Feinrecht «Team verwalten» hat, dann aber
 * nur als Mitglied mit HR oder Lesen. Geschrieben wird mit der Sitzung: die
 * Zeilenregeln aus 033 und 035 ziehen die Grenze, die Prüfungen hier geben
 * klare Meldungen.
 */
export const runtime = "nodejs";

const LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const limited = await rateLimit(`team-invite:${user.id}`, LIMIT, WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const parsed = parseInvitationInput(await req.json().catch(() => null));
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.data;

  const { data: isAdmin, error: adminErr } = await supabase.rpc("zeugnio_is_org_admin", {
    p_org_id: input.organizationId,
  });
  if (adminErr) {
    logError("[team/invitations] Admin-Prüfung fehlgeschlagen:", adminErr);
    return NextResponse.json({ error: "Prüfung fehlgeschlagen." }, { status: 500 });
  }
  if (!isAdmin) {
    // Feinrecht «Team verwalten» (035): als Mitglied, mit HR oder Lesen, nur in
    // Firmen mit diesem Recht. Dieselbe Grenze zieht die Zeilenregel.
    if (input.orgRole !== "mitglied" || !input.companyRole || !TEAM_MANAGER_ROLES.includes(input.companyRole)) {
      return NextResponse.json(
        { error: "Sie können nur mit den Rollen HR oder Lesen einladen." },
        { status: 403 },
      );
    }
    const { data: canManageAll, error: manageErr } = await supabase.rpc("zeugnio_can_manage_team_all", {
      p_company_ids: input.companyIds,
    });
    if (manageErr) {
      logError("[team/invitations] Teamrecht-Prüfung fehlgeschlagen:", manageErr);
      return NextResponse.json({ error: "Prüfung fehlgeschlagen." }, { status: 500 });
    }
    if (!canManageAll) {
      return NextResponse.json({ error: permissionDeniedMessage("team") }, { status: 403 });
    }
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, invite_domain_only")
    .eq("id", input.organizationId)
    .single();
  if (!org) return NextResponse.json({ error: "Organisation nicht gefunden." }, { status: 404 });

  // Die gewählten Firmen müssen zur Organisation gehören.
  if (input.companyIds.length > 0) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", org.id)
      .in("id", input.companyIds);
    if ((companies ?? []).length !== input.companyIds.length) {
      return NextResponse.json({ error: "Eine gewählte Firma gehört nicht zu dieser Organisation." }, { status: 400 });
    }
  }

  // Einstellung «nur Firmendomain»: die Adresse muss zu einer bestätigten Domain
  // einer Firma der Organisation gehören.
  if (org.invite_domain_only) {
    const domain = emailDomain(input.email);
    const { data: orgCompanies } = await supabase.from("companies").select("id").eq("organization_id", org.id);
    const ids = (orgCompanies ?? []).map((c: { id: string }) => c.id);
    const { data: verified } = ids.length
      ? await supabase.from("company_domains").select("domain").in("company_id", ids).eq("status", "verified")
      : { data: [] as { domain: string }[] };
    const allowed = new Set((verified ?? []).map((d: { domain: string }) => d.domain.toLowerCase()));
    if (!domain || !allowed.has(domain)) {
      return NextResponse.json(
        {
          error:
            "Diese Organisation lädt nur Adressen mit bestätigter Firmendomain ein" +
            (allowed.size ? ` (${Array.from(allowed).join(", ")}).` : ". Es ist noch keine Domain bestätigt."),
        },
        { status: 400 },
      );
    }
  }

  // Ist die Person schon Mitglied, schadet die Einladung nicht: die Annahme
  // ergänzt nur die Firmenzugänge und stuft niemanden zurück.

  // Eine offene Einladung an dieselbe Adresse wird ersetzt.
  await supabase
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", org.id)
    .eq("email", input.email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { token, tokenHash } = newInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

  const { data: created, error: insertErr } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: org.id,
      email: input.email,
      org_role: input.orgRole,
      company_role: input.companyRole,
      company_ids: input.companyIds,
      token_hash: tokenHash,
      invited_by_user_id: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (insertErr?.code === "23505") {
    // Eine offene Einladung, die jemand anderes verschickt hat (meist der
    // Admin), lässt sich ohne Admin-Recht nicht ersetzen.
    return NextResponse.json(
      { error: "An diese Adresse ist schon eine Einladung offen. Der Admin kann sie zurückziehen." },
      { status: 409 },
    );
  }
  if (insertErr || !created) {
    logError("[team/invitations] Anlegen fehlgeschlagen:", insertErr);
    return NextResponse.json({ error: "Die Einladung liess sich nicht speichern." }, { status: 500 });
  }

  const inviteUrl = new URL(
    `/app/einladung/${token}`,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const roleLabel = input.orgRole === "admin" ? "Admin" : COMPANY_ROLE_LABEL[input.companyRole!];
  const mail = buildTeamInvitationEmail({
    organizationName: org.name,
    roleLabel,
    inviterName: profile?.full_name ?? undefined,
    inviterEmail: profile?.email ?? user.email ?? undefined,
    inviteUrl,
    expiresAt,
  });
  const sent = await sendEmail({ to: input.email, subject: mail.subject, html: mail.html, text: mail.text });

  return NextResponse.json(
    {
      ok: true,
      id: created.id,
      email_sent: sent.sent,
      email_error: sent.error,
      // Den Link gibt es nur jetzt: gespeichert ist nur sein Hash. Er dient als
      // Rückfall, falls die Mail nicht ankommt.
      invite_url: inviteUrl,
      expires_at: expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
