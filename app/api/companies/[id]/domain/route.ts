import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import {
  normalizeDomain,
  emailDomain,
  isFreeMailDomain,
  domainsMatch,
} from "@/lib/company/domain";

// Service-Client (require @supabase/supabase-js) -> Node-Runtime.
export const runtime = "nodejs";

/**
 * POST /api/companies/[id]/domain
 * Body: { domain: string }
 *
 * Deklariert eine Aussteller-Domain für die Firma und versucht sofort die
 * E-Mail-Auto-Verifikation (V1): Endet die BEREITS per Magic-Link verifizierte
 * E-Mail des eingeloggten Users auf die deklarierte (Nicht-Freemail-)Domain,
 * wird die Domain als 'verified' gespeichert. Sonst 'pending' (DNS-TXT-Pfad
 * folgt in Phase 2).
 *
 * Schreiben läuft bewusst über den Service-Client NACH dem Ownership-Check —
 * `authenticated` hat auf company_domains keine Schreib-RLS (siehe Migration 019),
 * damit niemand per rohem PostgREST einfach status='verified' setzen kann.
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

  if (!(await userIsCompanyMember(supabase, id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeDomain((body as { domain?: string }).domain);
  if (!normalized) {
    return NextResponse.json(
      { error: "Bitte eine gültige Domain angeben (z.B. firma.ch)." },
      { status: 400 },
    );
  }

  // Eine Freemail-Domain als Firmen-Domain zu verifizieren ergibt keinen Sinn.
  if (isFreeMailDomain(normalized)) {
    return NextResponse.json(
      {
        error:
          "Freemail-Domains (z.B. gmail.com, gmx.ch, bluewin.ch) können nicht als Firmen-Domain verifiziert werden. Bitte die eigene Firmen-Domain angeben.",
      },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // Ist diese Firma+Domain bereits verifiziert? Dann nichts herabstufen.
  const { data: existing } = await svc
    .from("company_domains")
    .select("id, status")
    .eq("company_id", id)
    .eq("domain", normalized)
    .maybeSingle();

  if (existing?.status === "verified") {
    return NextResponse.json({
      ok: true,
      domain: normalized,
      status: "verified",
      method: "email",
      verified: true,
      alreadyVerified: true,
    });
  }

  const loginDomain = emailDomain(user.email);
  const canVerifyByEmail =
    !!loginDomain &&
    !isFreeMailDomain(loginDomain) &&
    domainsMatch(normalized, loginDomain);

  // Anti-Impersonation: dieselbe Domain darf nur EINE Firma verifiziert halten.
  // Vorab-Check für eine saubere Fehlermeldung; der partielle Unique-Index in
  // Migration 019 ist die harte Garantie (fängt auch Races ab).
  if (canVerifyByEmail) {
    const { data: otherVerified } = await svc
      .from("company_domains")
      .select("company_id")
      .eq("domain", normalized)
      .eq("status", "verified")
      .maybeSingle();
    if (otherVerified && otherVerified.company_id !== id) {
      return NextResponse.json(
        { error: "Diese Domain ist bereits von einer anderen Firma verifiziert." },
        { status: 409 },
      );
    }
  }

  const row = {
    company_id: id,
    domain: normalized,
    method: "email",
    status: canVerifyByEmail ? "verified" : "pending",
    verified_at: canVerifyByEmail ? new Date().toISOString() : null,
    verified_by: canVerifyByEmail ? user.id : null,
  };

  const { error: upErr } = await svc
    .from("company_domains")
    .upsert(row, { onConflict: "company_id,domain" });

  if (upErr) {
    // 23505 = unique_violation des partiellen Verified-Index -> woanders belegt.
    if ((upErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Diese Domain ist bereits von einer anderen Firma verifiziert." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Domain konnte nicht gespeichert werden: ${upErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    domain: normalized,
    status: row.status,
    method: "email",
    verified: canVerifyByEmail,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userIsCompanyMember(supabase, id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

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
