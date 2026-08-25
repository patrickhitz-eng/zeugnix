import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";

/**
 * GET /api/cron/pii-cleanup  (H4 — PII-Minimierung)
 *
 * Wird taeglich per Vercel Cron aufgerufen (vercel.json). Setzt die
 * hochgeladenen Fremdtexte aus Verify/Analyse (bis zu 50k Zeichen fremder
 * Zeugnistext, siehe app/api/verify/route.ts + app/api/analyze/route.ts)
 * nach 180 Tagen auf null - die Zeilen selbst bleiben erhalten (result,
 * calculated_hash, paid, stripe_payment_id, Scores etc. sind Business-Daten,
 * kein PII-Risiko), nur der Rohtext-Inhalt wird entfernt (revDSG).
 *
 * Schutz: Vercel Cron sendet automatisch `Authorization: Bearer $CRON_SECRET`,
 * sobald die Env-Var CRON_SECRET gesetzt ist. Ohne gesetzte Env-Var lehnt die
 * Route jeden Aufruf ab (fail closed), damit niemand aus Versehen einen
 * ungeschuetzten Bulk-Update-Endpoint deployt.
 */
const RETENTION_DAYS = 180;

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

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = createServiceClient();

  const { data: verifications, error: verificationsErr } = await supabase
    .from("verifications")
    .update({ extracted_text: null, extracted_canonical_content: null })
    .lt("created_at", cutoff)
    .not("extracted_text", "is", null)
    .select("id");

  const { data: analyses, error: analysesErr } = await supabase
    .from("analyses")
    .update({ extracted_text: null })
    .lt("created_at", cutoff)
    .not("extracted_text", "is", null)
    .select("id");

  if (verificationsErr || analysesErr) {
    console.error("[pii-cleanup] Fehler:", verificationsErr, analysesErr);
    return NextResponse.json(
      {
        error:
          verificationsErr?.message ?? analysesErr?.message ?? "Cleanup fehlgeschlagen",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    verificationsAnonymized: verifications?.length ?? 0,
    analysesAnonymized: analyses?.length ?? 0,
  });
}
