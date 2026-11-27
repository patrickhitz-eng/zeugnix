import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { clientIpKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { analyzeText } from "@/lib/phrases/analyze";
import { logError } from "@/lib/log";
import { readJsonLimited } from "@/lib/http/read-json";
import {
  MAX_VERIFY_BODY_BYTES,
  MAX_VERIFY_TEXT_CHARS,
  VERIFY_TEXT_TOO_LONG,
} from "@/lib/verify/limits";

// Öffentlicher, Service-Role-gestützter Endpunkt → Rate-Limit gegen DoS/Abuse.
const ANALYZE_LIMIT = 10;
const ANALYZE_WINDOW_MS = 60 * 1000;

/**
 * POST /api/analyze
 *
 * Body: { text: string }
 *
 * Liefert eine Klartext-Analyse des Zeugnistexts. MVP-Stub mit
 * regelbasierter Heuristik. Speichert nur das Ergebnis in 'analyses', nicht
 * den Text und keine E-Mail (Fahrplan Marktstart, Schritt 7). Die Stärken
 * zitieren nur Wendungen aus dem festen Katalog in lib/phrases/analyze.ts.
 *
 * In der Produktivversion sollte hier ein bezahlter LLM-Call laufen
 * (nach Stripe-Webhook-Bestätigung).
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(
      `analyze:${clientIpKey(req)}`,
      ANALYZE_LIMIT,
      ANALYZE_WINDOW_MS,
    );
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    // Gleiche Grenzen wie /api/verify (lib/verify/limits.ts): Die Prüfseite
    // schickt denselben Text an beide Routen.
    const body = await readJsonLimited(req, MAX_VERIFY_BODY_BYTES);
    if (!body.ok) {
      return body.reason === "zu_gross"
        ? NextResponse.json({ error: VERIFY_TEXT_TOO_LONG }, { status: 413 })
        : NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    const text = (body.value as { text?: unknown } | null)?.text;

    if (typeof text !== "string" || text.length < 50) {
      return NextResponse.json(
        { error: "Text zu kurz oder fehlt" },
        { status: 400 },
      );
    }
    if (text.length > MAX_VERIFY_TEXT_CHARS) {
      return NextResponse.json({ error: VERIFY_TEXT_TOO_LONG }, { status: 413 });
    }

    const result = analyzeText(text);

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("analyses")
      .insert({
        uploaded_file_path: "inline-text",
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
      });

    if (error) {
      // Über logError, nicht console: Der Insert-Fehler von PostgREST trägt die
      // eingefügte Zeile mit sich.
      logError("[analyze] Insert fehlgeschlagen:", error);
    }

    // Ohne die ID der gespeicherten Zeile: Die Seite braucht sie nicht, und
    // interne Kennungen gehen nicht an Anonyme.
    return NextResponse.json({ ok: true, analysis: result });
  } catch (err) {
    logError("[analyze] Fehler:", err);
    return NextResponse.json(
      { error: "Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es später erneut." },
      { status: 500 },
    );
  }
}
