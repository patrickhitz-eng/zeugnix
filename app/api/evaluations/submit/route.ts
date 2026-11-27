import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { clientIpKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { buildEvaluationSubmittedEmail } from "@/lib/email/templates";
import { evaluationMailRecipients } from "@/lib/team/notify-recipients";
import { lookupHash } from "@/lib/link-token";
import {
  GENERIC_SUBMIT_ERROR,
  MAX_BODY_CHARS,
  parseSubmission,
  submitCodeResponse,
} from "@/lib/evaluations/submission";

// Öffentlicher (token-basierter) Endpunkt → Rate-Limit gegen Token-Bruteforce
// und Spam.
const SUBMIT_LIMIT = 20;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Abgabe der vorgesetzten Person über den Einladungslink.
 *
 * Gehärtet nach dem Sicherheitstest vom 24.11.2026 (Befund T7):
 *   - Striktes Schema für den Body (lib/evaluations/submission.ts), Grösse
 *     begrenzt, unbekannte Felder verworfen.
 *   - Das Schreiben läuft in EINER Datenbankfunktion (Migration 043): Sperre
 *     auf Zeugnis und Einladung, Prüfungen unter der Sperre, nur die Einträge
 *     der eigenen Einladung ersetzen, Status setzen. Zwei gleichzeitige
 *     Abgaben über denselben Link können sich so nicht mehr überholen.
 *   - Datenbankfehler gehen nur ins Server-Log. Der Browser bekommt eine
 *     allgemeine Meldung.
 * Die Sperre für versiegelte Zeugnisse (H1, PR #109) prüft die Funktion unter
 * der Sperre; der Trigger aus 038 bleibt als zweite Linie.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(
      `eval-submit:${clientIpKey(req)}`,
      SUBMIT_LIMIT,
      SUBMIT_WINDOW_MS,
    );
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    // Body begrenzt lesen: erst die angekündigte Länge, dann die tatsächliche.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_CHARS * 4) {
      return NextResponse.json({ error: "Anfrage zu gross" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: "Anfrage zu gross" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    const parsed = parseSubmission(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Gesucht wird über den SHA-256 des Tokens (Sicherheitstest 24.11.2026, M4).
    // Was kein Token sein kann, gilt als nicht gefunden.
    const tokenHash = lookupHash(parsed.token);
    if (!tokenHash) {
      return NextResponse.json({ error: "Einladung nicht gefunden" }, { status: 404 });
    }

    const supabase = createServiceClient();

    const { data: code, error: rpcErr } = await supabase.rpc(
      "zeugnio_submit_manager_evaluation",
      { p_token_hash: tokenHash, p_evaluations: parsed.evaluations },
    );
    if (rpcErr) {
      console.error("[evaluations/submit] Abgabe fehlgeschlagen:", rpcErr.message);
      return NextResponse.json({ error: GENERIC_SUBMIT_ERROR }, { status: 500 });
    }

    const result = submitCodeResponse(code);
    if (result.status === 500) {
      console.error("[evaluations/submit] Unerwartete Antwort der Abgabefunktion:", code);
    }
    if (code !== "ok") {
      return NextResponse.json(result.body, { status: result.status });
    }

    // HR per Mail benachrichtigen, dass Beurteilung eingegangen ist. Empfänger
    // ist, wer das Zeugnis angelegt hat und es noch bearbeiten darf; sonst das
    // aktive Team der Firma (lib/team/notify-recipients.ts). Die Abgabe ist an
    // dieser Stelle bereits gespeichert; Fehler hier blockieren sie nicht.
    try {
      const { data: inv, error: invErr } = await supabase
        .from("manager_invitations")
        .select(
          "certificate_id, manager_email, manager_name, certificates(company_id, created_by_user_id)",
        )
        .eq("token_hash", tokenHash)
        .single();
      if (invErr || !inv) {
        console.error("[evaluations/submit] Einladung für Mail nicht geladen:", invErr?.message);
      } else {
        const cert = inv.certificates as
          | { company_id?: string | null; created_by_user_id?: string | null }
          | null;
        const recipients = await evaluationMailRecipients(
          supabase,
          cert?.company_id,
          cert?.created_by_user_id,
        );
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
        const certificateUrl = `${baseUrl}/app/certificates/${inv.certificate_id}`;

        for (const recipient of recipients) {
          // Der Name der beurteilten Person geht bewusst NICHT in die Mail –
          // siehe den Kopf von lib/email/templates.ts.
          const mail = buildEvaluationSubmittedEmail({
            hrName: recipient.fullName ?? undefined,
            managerEmail: inv.manager_email,
            managerName: inv.manager_name ?? undefined,
            certificateUrl,
          });

          await sendEmail({
            to: recipient.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
        }
      }
    } catch (notifyErr) {
      // Mail-Versand soll den Submit nicht blockieren
      console.error("[evaluations/submit] Notify HR error:", notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[evaluations/submit] Unerwarteter Fehler:", err);
    return NextResponse.json({ error: GENERIC_SUBMIT_ERROR }, { status: 500 });
  }
}
