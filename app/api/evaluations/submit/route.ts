import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { sendEmail } from "@/lib/email/send";
import { buildEvaluationSubmittedEmail } from "@/lib/email/templates";

export async function POST(req: NextRequest) {
  try {
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

    // Bestehende Evaluations zu diesem Zeugnis löschen (idempotent)
    await supabase.from("evaluations").delete().eq("certificate_id", inv.certificate_id);

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

    // Invitation als submitted markieren, Status auf manager_submitted
    await supabase
      .from("manager_invitations")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", inv.id);

    await supabase
      .from("certificates")
      .update({ status: "manager_submitted" })
      .eq("id", inv.certificate_id);

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
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnix.ch";
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
