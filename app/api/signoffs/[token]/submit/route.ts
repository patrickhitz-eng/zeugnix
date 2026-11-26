import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { clientIpKey, getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { lookupHash } from "@/lib/link-token";
import { resolveCertificatePresentation } from "@/lib/certificate/presentation";
import {
  certificateTextHash,
  sameSignatoryText,
  slotSignatory,
} from "@/lib/certificate/signoff-binding";
import { normalizeVerifyHash } from "@/lib/hash/canonicalize";

export const runtime = "nodejs";

// Öffentlicher Token-Endpunkt → Rate-Limit gegen Missbrauch.
const SUBMIT_LIMIT = 30;
const SUBMIT_WINDOW_MS = 60 * 1000;

/**
 * POST /api/signoffs/[token]/submit
 * Body: { action: 'confirm' | 'decline', textHash?: string }
 *
 * Öffentlicher (token-basierter) Endpunkt: die benannte unterzeichnende Person
 * bestätigt oder lehnt das Zeugnis ab. Bestätigung = identitätsgebundene
 * Freigabe (E-Mail der Person ist bereits in der Zeile hinterlegt); Zeitpunkt,
 * IP und User-Agent werden protokolliert.
 *
 * M3 (Sicherheitstest 24.11.2026): Die Bestätigung ist an den Text gebunden,
 * den die Person gesehen hat. Die Freigabe-Seite schickt dessen SHA-256 mit
 * (`textHash`). Passt er nicht mehr zum heutigen Text, hat HR inzwischen
 * geändert, und die Bestätigung wird abgewiesen, statt einen Text freizugeben,
 * den die Person nie gesehen hat. Ebenso, wenn heute ein anderer Name oder
 * eine andere Rolle im Unterschriftsfeld steht als bei der Anfrage.
 * Gespeichert werden Hash, Name und Rolle; Prüfseite, PDF und App vergleichen
 * sie mit dem Stand des Zeugnisses (lib/certificate/signoff-binding.ts).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limited = await rateLimit(`signoff-submit:${clientIpKey(req)}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action;
  if (action !== "confirm" && action !== "decline") {
    return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
  }
  const shownTextHash = normalizeVerifyHash((body as { textHash?: string }).textHash);

  // Gesucht wird über den SHA-256 des Tokens (Sicherheitstest 24.11.2026, M4).
  const tokenHash = lookupHash(token);
  if (!tokenHash) {
    return NextResponse.json({ error: "Freigabe-Link ungültig." }, { status: 404 });
  }

  const svc = createServiceClient();
  const { data: signoff } = await svc
    .from("certificate_signoffs")
    .select(
      "id, slot, name, role, status, expires_at, sent_at, " +
        "certificates(type, hash_version, meta_snapshot, generated_text, edited_text, " +
        "signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role, " +
        "companies(name, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role))",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!signoff) {
    return NextResponse.json({ error: "Freigabe-Link ungültig." }, { status: 404 });
  }

  if (signoff.status === "confirmed" || signoff.status === "declined") {
    // Idempotent: bereits final beantwortet.
    return NextResponse.json({ ok: true, status: signoff.status, already: true });
  }

  if (new Date(signoff.expires_at) < new Date()) {
    await svc
      .from("certificate_signoffs")
      .update({ status: "expired" })
      .eq("id", signoff.id);
    return NextResponse.json({ error: "Freigabe-Link ist abgelaufen." }, { status: 400 });
  }

  let update: Record<string, unknown>;
  if (action === "confirm") {
    const cert: any = Array.isArray(signoff.certificates)
      ? signoff.certificates[0]
      : signoff.certificates;
    const company: any = cert?.companies
      ? Array.isArray(cert.companies)
        ? cert.companies[0]
        : cert.companies
      : null;
    if (!cert) {
      return NextResponse.json({ error: "Freigabe-Link ungültig." }, { status: 404 });
    }

    // Text: Die Person bestätigt genau den Text, den die Seite ihr gezeigt hat.
    const currentTextHash = await certificateTextHash(cert);
    if (!currentTextHash) {
      return NextResponse.json(
        { error: "Für dieses Zeugnis liegt noch kein Text vor." },
        { status: 409 },
      );
    }
    if (shownTextHash !== currentTextHash) {
      return NextResponse.json(
        {
          error:
            "Der Zeugnistext wurde inzwischen geändert. Bitte laden Sie die Seite neu und prüfen Sie den Text erneut.",
          reason: "text_changed",
        },
        { status: 409 },
      );
    }

    // Name und Rolle: Die Person wurde unter `name`/`role` angefragt. Steht
    // heute jemand anderes im Unterschriftsfeld, gilt der Link nicht mehr.
    const slotNow = slotSignatory(
      resolveCertificatePresentation(cert, company ?? {}).signatories,
      signoff.slot,
    );
    if (
      !slotNow.name ||
      !sameSignatoryText(signoff.name, slotNow.name) ||
      !sameSignatoryText(signoff.role, slotNow.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Die Angaben zur unterzeichnenden Person wurden geändert. Bitte fordern Sie beim Arbeitgeber einen neuen Link an.",
          reason: "signatory_changed",
        },
        { status: 409 },
      );
    }

    update = {
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_ip: getClientIp(req),
      confirmed_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
      confirmed_text_hash: currentTextHash,
      confirmed_name: signoff.name,
      confirmed_role: signoff.role ?? null,
    };
  } else {
    update = { status: "declined" };
  }

  // Nur genau die Anfrage beantworten, die oben geprüft wurde. Fordert HR
  // inzwischen neu an, ändert sich `sent_at` (und Name, Rolle, Token), und
  // dieser Aufruf trifft die Zeile nicht mehr.
  let updQuery = svc
    .from("certificate_signoffs")
    .update(update)
    .eq("id", signoff.id)
    .in("status", ["pending", "viewed"]);
  updQuery = signoff.sent_at
    ? updQuery.eq("sent_at", signoff.sent_at)
    : updQuery.is("sent_at", null);
  const { data: updated, error: updErr } = await updQuery
    .select("id");

  if (updErr) {
    return NextResponse.json(
      { error: `Antwort konnte nicht gespeichert werden: ${updErr.message}` },
      { status: 500 },
    );
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Dieser Freigabe-Link ist nicht mehr gültig. Bitte laden Sie die Seite neu." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status: action === "confirm" ? "confirmed" : "declined" });
}
