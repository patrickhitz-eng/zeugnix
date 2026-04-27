import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { analyzeText } from "@/lib/phrases/analyze";

/**
 * POST /api/analyze
 *
 * Body: { text: string, userEmail?: string }
 *
 * Liefert eine Klartext-Analyse des Zeugnistexts. MVP-Stub mit
 * regelbasierter Heuristik. Speichert das Ergebnis in 'analyses'.
 *
 * In der Produktivversion sollte hier ein bezahlter LLM-Call laufen
 * (nach Stripe-Webhook-Bestätigung).
 */
export async function POST(req: NextRequest) {
  try {
    const { text, userEmail } = await req.json();

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Text zu kurz oder fehlt" },
        { status: 400 },
      );
    }

    const result = analyzeText(text);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("analyses")
      .insert({
        uploaded_file_path: "inline-text",
        extracted_text: text.slice(0, 50000),
        overall_score: result.overall_score,
        overall_rating: result.overall_rating,
        confidence_level: result.confidence_level,
        category_scores: result.category_scores,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        closing_formula_rating: result.closing_formula_rating,
        warnings: result.warnings,
        summary: result.summary,
        paid: false,
        user_email: userEmail ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Analyse-Insert-Fehler:", error);
    }

    return NextResponse.json({ ok: true, analysis: result, id: data?.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
