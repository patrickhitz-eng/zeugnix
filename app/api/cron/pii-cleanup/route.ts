import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { RETENTION, cutoffIso } from "@/lib/retention";
import { logError } from "@/lib/log";

/**
 * GET /api/cron/pii-cleanup  (H4 – PII-Minimierung, ab Schritt 17 alle Fristen)
 *
 * Läuft täglich (Vercel Cron bzw. deploy/nine/cron-pii-cleanup.mjs). Fristen
 * stehen in lib/retention.ts:
 *
 *  - Prüfung und Analyse: hochgeladener Fremdtext (bis 50k Zeichen fremder
 *    Zeugnistext) und die E-Mail der prüfenden Person nach 180 Tagen auf null.
 *    Die Zeilen selbst bleiben (Ergebnis, Hash, Zahlung sind Geschäftsdaten).
 *  - Unterzeichner-Freigabe: IP-Adresse und Browserkennung nach 12 Monaten
 *    auf null. Zeitpunkt und E-Mail der Bestätigung bleiben, solange das
 *    Zeugnis besteht; sie stehen im Dokument.
 *  - Prüfregister (036): Einträge nach Ablauf von delete_after löschen.
 *
 * Schutz: Vercel Cron sendet automatisch `Authorization: Bearer $CRON_SECRET`,
 * sobald die Env-Var CRON_SECRET gesetzt ist. Ohne gesetzte Env-Var lehnt die
 * Route jeden Aufruf ab (fail closed).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadsCutoff = cutoffIso(RETENTION.verifyUploadsDays);
  const signoffCutoff = cutoffIso(RETENTION.signoffEvidenceDays);
  const supabase = createServiceClient();

  const { data: verifications, error: verificationsErr } = await supabase
    .from("verifications")
    .update({ extracted_text: null, extracted_canonical_content: null, user_email: null })
    .lt("created_at", uploadsCutoff)
    .or("extracted_text.not.is.null,extracted_canonical_content.not.is.null,user_email.not.is.null")
    .select("id");

  const { data: analyses, error: analysesErr } = await supabase
    .from("analyses")
    .update({ extracted_text: null, user_email: null })
    .lt("created_at", uploadsCutoff)
    .or("extracted_text.not.is.null,user_email.not.is.null")
    .select("id");

  const { data: signoffs, error: signoffsErr } = await supabase
    .from("certificate_signoffs")
    .update({ confirmed_ip: null, confirmed_user_agent: null })
    .lt("confirmed_at", signoffCutoff)
    .or("confirmed_ip.not.is.null,confirmed_user_agent.not.is.null")
    .select("id");

  const { data: register, error: registerErr } = await supabase
    .from("certificate_register")
    .delete()
    .lt("delete_after", new Date().toISOString())
    .select("certificate_id");

  const errors = [verificationsErr, analysesErr, signoffsErr, registerErr].filter(Boolean);
  if (errors.length > 0) {
    logError("[pii-cleanup] Fehler:", ...errors);
    return NextResponse.json(
      { error: (errors[0] as { message?: string }).message ?? "Cleanup fehlgeschlagen" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    verificationsAnonymized: verifications?.length ?? 0,
    analysesAnonymized: analyses?.length ?? 0,
    signoffsAnonymized: signoffs?.length ?? 0,
    registerExpired: register?.length ?? 0,
  });
}
