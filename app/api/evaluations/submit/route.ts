import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { buildEvaluationSubmittedEmail } from "@/lib/email/templates";

// Öffentlicher (token-basierter) Endpunkt → Rate-Limit gegen Token-Bruteforce
// und Spam. Doppel-Submit ist zusätzlich DB-seitig abgesichert.
const SUBMIT_LIMIT = 20;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(
      `eval-submit:${getClientIp(req)}`,
      SUBMIT_LIMIT,
      SUBMIT_WINDOW_MS,
    );
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    const { token, evaluations } = await req.json();

    if (!token || !Array.isArray(evaluations)) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Invitation per Token validieren – mit allen verbundenen Daten für Mail
    const { data: inv } = await supabase
      .from("manager_invitations")
      .select(
        "*, certificates(id, company_id, created_by_user_id, employees(first_name, last_name), companies(name))",
      )
      .eq("token", token)
      .single();

    if (!inv) {
      return NextResponse.json(
        { error: "Einladung nicht gefunden" },
        { status: 404 },
      );
    }

    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: "Einladung abgelaufen" }, { status: 410 });
    }

    if (inv.status === "submitted") {
      return NextResponse.json(
        { error: "Beurteilung wurde bereits abgegeben" },
        { status: 409 },
      );
    }

    // Bestehende Evaluations zu diesem Zeugnis löschen (idempotent). Fehler hier
    // ist kritisch, sonst würden neue Beurteilungen zu den alten addiert.
    const { error: delErr } = await supabase
      .from("evaluations")
      .delete()
      .eq("certificate_id", inv.certificate_id);
    if (delErr) {
      return NextResponse.json(
        { error: `Vorherige Beurteilungen konnten nicht ersetzt werden: ${delErr.message}` },
        { status: 500 },
      );
    }

    // Neue Evaluations einfügen
    const rows = evaluations.map((e: any) => ({
      certificate_id: inv.certificate_id,
      invitation_id: inv.id,
      submitted_by_email: inv.manager_email,
      category: e.category,
      subcategory: e.subcategory ?? null,
      rating: e.rating,
      free_text: e.free_text ?? null,
    }));

    const { error: insErr } = await supabase.from("evaluations").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Invitation als submitted markieren (verhindert Doppel-Abgabe) – Fehler
    // kritisch, da die Beurteilung sonst erneut eingereicht werden könnte. Der
    // erneute Versuch ist dank delete-then-insert idempotent.
    const { error: invUpdErr } = await supabase
      .from("manager_invitations")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (invUpdErr) {
      return NextResponse.json(
        { error: `Einladung konnte nicht abgeschlossen werden: ${invUpdErr.message}` },
        { status: 500 },
      );
    }

    const { error: certUpdErr } = await supabase
      .from("certificates")
      .update({ status: "manager_submitted" })
      .eq("id", inv.certificate_id);
    if (certUpdErr) {
      console.warn("[evaluations/submit] Zeugnis-Status-Update fehlgeschlagen:", certUpdErr.message);
    }

    // HR per Mail benachrichtigen, dass Beurteilung eingegangen ist
    try {
      const cert: any = inv.certificates;
      if (cert?.created_by_user_id) {
        const { data: hrProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", cert.created_by_user_id)
          .single();

        if (hrProfile?.email) {
          const employee: any = cert.employees;
          const employeeName = `${employee.first_name} ${employee.last_name}`;
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
          const certificateUrl = `${baseUrl}/app/certificates/${inv.certificate_id}`;

          const mail = buildEvaluationSubmittedEmail({
            hrName: hrProfile.full_name ?? undefined,
            employeeName,
            managerEmail: inv.manager_email,
            managerName: inv.manager_name ?? undefined,
            certificateUrl,
          });

          await sendEmail({
            to: hrProfile.email,
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
