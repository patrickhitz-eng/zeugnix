import { NextRequest, NextResponse } from "next/server";
import { Resolver } from "node:dns/promises";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  dnsRecordName,
  dnsRecordValue,
  isValidDnsToken,
  normalizeDomain,
  txtRecordsContain,
} from "@/lib/company/domain";

// node:dns -> Node-Runtime.
export const runtime = "nodejs";

// Jede Prüfung ist ein DNS-Lookup nach aussen. Grosszügig genug für «Eintrag
// gesetzt, noch nicht da, nochmals versuchen», knapp genug gegen Missbrauch.
const CHECK_LIMIT = 30;
const CHECK_WINDOW_MS = 60 * 60 * 1000;

/**
 * POST /api/companies/[id]/domain/dns
 * Body: { domain: string }
 *
 * Prüft den TXT-Eintrag `_zeugnio.<domain>` auf den Wert
 * `zeugnio-verification=<token>` der Firma. Steht er, gilt die Domain als
 * bestätigt (status 'verified', method 'dns') und die öffentliche Prüfung zeigt
 * «Aussteller bestätigt».
 *
 * Warum DNS (Sicherheitstest 24.11.2026, Befund M2): Den Eintrag setzen kann
 * nur, wer die Domain verwaltet. Eine Mailadresse an der Domain hat dagegen
 * jede Mitarbeiterin; das ist die Mail-Stufe 'email_confirmed'. Sie gilt als
 * bestätigt, DNS ist die freiwillige höchste Stufe («Domain geprüft») und der
 * Weg für Firmen ohne passende Anmelde-Adresse.
 *
 * Eine Domain kann nur EINE Firma per DNS bestätigt halten (Unique-Index aus
 * 019). Eine reine Mail-Vorstufe einer anderen Firma blockiert das nicht.
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

  const limited = await rateLimit(`domain-dns:${user.id}`, CHECK_LIMIT, CHECK_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const domain = normalizeDomain((body as { domain?: string }).domain);
  if (!domain) {
    return NextResponse.json({ error: "Domain fehlt oder ungültig." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: row } = await svc
    .from("company_domains")
    .select("id, status, dns_token")
    .eq("company_id", id)
    .eq("domain", domain)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { error: "Diese Domain ist für die Firma nicht erfasst." },
      { status: 404 },
    );
  }
  if (row.status === "verified") {
    return NextResponse.json({ ok: true, domain, verified: true, alreadyVerified: true });
  }
  if (!isValidDnsToken(row.dns_token)) {
    return NextResponse.json(
      { error: "Für diese Domain fehlt der Prüfwert. Bitte die Domain neu erfassen." },
      { status: 409 },
    );
  }

  const name = dnsRecordName(domain);
  let records: string[][] = [];
  let lookupError: string | null = null;
  try {
    // Eigener Resolver mit Zeitlimit, damit ein hängender Nameserver die
    // Anfrage nicht blockiert.
    const resolver = new Resolver({ timeout: 4000, tries: 2 });
    records = await resolver.resolveTxt(name);
  } catch (err) {
    const code = (err as { code?: string }).code;
    // ENOTFOUND/ENODATA: Eintrag (noch) nicht vorhanden. Manche Resolver
    // (gemessen 25.11.2026 an einem Heimrouter) melden einen fehlenden Namen
    // als ESERVFAIL statt ENOTFOUND; auch das heisst für die Firma «noch nicht
    // da». Nur Zeitüberschreitung und Verbindungsfehler gelten als DNS-Problem.
    if (code !== "ENOTFOUND" && code !== "ENODATA" && code !== "ESERVFAIL") {
      lookupError = code ?? "unbekannt";
    }
  }

  if (!txtRecordsContain(records, row.dns_token)) {
    return NextResponse.json({
      ok: true,
      domain,
      verified: false,
      found: records.length,
      lookupError,
      dnsRecordName: name,
      dnsRecordValue: dnsRecordValue(row.dns_token),
    });
  }

  // Eintrag gefunden. Hält schon eine andere Firma diese Domain per DNS?
  const { data: other } = await svc
    .from("company_domains")
    .select("company_id")
    .eq("domain", domain)
    .eq("status", "verified")
    .neq("company_id", id)
    .maybeSingle();
  if (other) {
    return NextResponse.json(
      {
        error:
          "Diese Domain ist bereits von einer anderen Firma per DNS bestätigt. Bitte melden Sie sich bei uns.",
      },
      { status: 409 },
    );
  }

  const { error: upErr } = await svc
    .from("company_domains")
    .update({
      method: "dns",
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
    })
    .eq("id", row.id);

  if (upErr) {
    if ((upErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        {
          error:
            "Diese Domain ist bereits von einer anderen Firma per DNS bestätigt. Bitte melden Sie sich bei uns.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Die Bestätigung konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, domain, verified: true });
}
