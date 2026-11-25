import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { randomBytes } from "node:crypto";
import {
  normalizeDomain,
  emailDomain,
  isFreeMailDomain,
  isValidDnsToken,
  dnsRecordName,
  dnsRecordValue,
} from "@/lib/company/domain";

// Service-Client (node:crypto für die Zugangstoken) -> Node-Runtime.
export const runtime = "nodejs";

/**
 * POST /api/companies/[id]/domain
 * Body: { domain: string }
 *
 * Erfasst eine Aussteller-Domain für die Firma. Seit 25.11.2026 (Migration 039,
 * Sicherheitstest Befund M2) gibt es zwei Stufen:
 *
 *  - 'email_confirmed' (Mail-Stufe): Die angemeldete Adresse liegt an GENAU
 *    dieser Domain. Gilt als bestätigt («über Firmen-Mailadresse bestätigt»).
 *    Nicht exklusiv: Niemand kann eine Domain so für andere besetzen.
 *  - 'verified' (DNS, freiwillig, höchste Stufe): siehe
 *    POST /api/companies/[id]/domain/dns.
 *
 * Jede noch nicht per DNS bestätigte Domain bekommt hier ein Token für den
 * TXT-Eintrag. Die Antwort nennt Name und Wert des Eintrags.
 *
 * Schreiben läuft bewusst über den Service-Client NACH dem Rechte-Check —
 * `authenticated` hat auf company_domains keine Schreib-RLS (siehe Migration 019),
 * damit niemand per rohem PostgREST einfach status='verified' setzen kann.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userHasCompanyPermission(supabase, id, user.id, "admin")))
    return NextResponse.json({ error: permissionDeniedMessage("admin") }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeDomain((body as { domain?: string }).domain);
  if (!normalized) {
    return NextResponse.json(
      { error: "Bitte eine gültige Domain angeben (z.B. firma.ch)." },
      { status: 400 },
    );
  }

  // Eine Freemail-Domain als Firmen-Domain zu bestätigen ergibt keinen Sinn.
  if (isFreeMailDomain(normalized)) {
    return NextResponse.json(
      {
        error:
          "Freemail-Domains (z.B. gmail.com, gmx.ch, bluewin.ch) können nicht als Firmen-Domain bestätigt werden. Bitte die eigene Firmen-Domain angeben.",
      },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  const { data: existing } = await svc
    .from("company_domains")
    .select("id, status, method, dns_token")
    .eq("company_id", id)
    .eq("domain", normalized)
    .maybeSingle();

  // Schon per DNS bestätigt: nichts ändern.
  if (existing?.status === "verified") {
    return NextResponse.json({
      ok: true,
      domain: normalized,
      status: "verified",
      method: existing.method ?? "dns",
      verified: true,
      alreadyVerified: true,
    });
  }

  // Vorstufe nur bei EXAKT gleicher Domain. Früher genügte eine Subdomain
  // (hr.firma.ch für firma.ch); damit liess sich über x@firma.co.uk sogar
  // «co.uk» beanspruchen.
  const loginDomain = emailDomain(user.email);
  const mailMatches =
    !!loginDomain && !isFreeMailDomain(loginDomain) && loginDomain === normalized;

  const dnsToken: string = isValidDnsToken(existing?.dns_token)
    ? existing!.dns_token
    : randomBytes(16).toString("hex");

  const keepMailConfirmation = existing?.status === "email_confirmed";
  const status = mailMatches || keepMailConfirmation ? "email_confirmed" : "pending";

  const row = {
    company_id: id,
    domain: normalized,
    method: "email",
    status,
    dns_token: dnsToken,
    verified_at: status === "email_confirmed" ? new Date().toISOString() : null,
    verified_by: status === "email_confirmed" ? user.id : null,
  };

  const { error: upErr } = await svc
    .from("company_domains")
    .upsert(row, { onConflict: "company_id,domain" });

  if (upErr) {
    return NextResponse.json(
      { error: `Domain konnte nicht gespeichert werden: ${upErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    domain: normalized,
    status,
    method: "email",
    verified: false,
    emailConfirmed: status === "email_confirmed",
    dnsToken,
    dnsRecordName: dnsRecordName(normalized),
    dnsRecordValue: dnsRecordValue(dnsToken),
    // Nur für die eigene UI: die Domain der angemeldeten E-Mail, damit die
    // Meldung bei fehlendem Match konkret sein kann.
    loginDomain: loginDomain ?? null,
  });
}

/**
 * DELETE /api/companies/[id]/domain
 * Body: { domain: string }
 *
 * Entfernt eine (auch verifizierte) Domain der Firma. Ownership vorausgesetzt.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userHasCompanyPermission(supabase, id, user.id, "admin")))
    return NextResponse.json({ error: permissionDeniedMessage("admin") }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeDomain((body as { domain?: string }).domain);
  if (!normalized) {
    return NextResponse.json({ error: "Domain fehlt oder ungültig." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error: delErr } = await svc
    .from("company_domains")
    .delete()
    .eq("company_id", id)
    .eq("domain", normalized);

  if (delErr) {
    return NextResponse.json(
      { error: `Domain konnte nicht entfernt werden: ${delErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
