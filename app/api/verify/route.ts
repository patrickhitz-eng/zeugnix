import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  canonicalizeForHash,
  extractBodyBetweenSentinels,
  sha256,
  type VerifyOutcome,
} from "@/lib/hash/canonicalize";

// Öffentlicher, Service-Role-gestützter Endpunkt → Rate-Limit gegen DoS/Abuse.
const VERIFY_LIMIT = 20;
const VERIFY_WINDOW_MS = 60 * 1000;

/**
 * POST /api/verify
 *
 * Body: { text: string, userEmail?: string }
 *
 * Erwartet bereits aus PDF extrahierten Text. Die PDF-Extraktion selbst
 * läuft im Browser oder in einem separaten Endpoint, weil pdf-parse o.ä.
 * grosse Dependencies sind.
 *
 * Antwort: { result, calculatedHash, matchedCertificateId? }
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(
      `verify:${getClientIp(req)}`,
      VERIFY_LIMIT,
      VERIFY_WINDOW_MS,
    );
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    const body = await req.json();
    const { text, userEmail } = body as { text?: string; userEmail?: string };

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Text zu kurz oder fehlt" },
        { status: 400 },
      );
    }

    // 1. Body zwischen den Sentinels isolieren – schliesst Briefkopf,
    //    Unterschriften und Hash-Block aus dem extrahierten PDF-Text aus.
    const rawBody = extractBodyBetweenSentinels(text);
    if (rawBody === null) {
      return NextResponse.json(
        {
          result: "no_sentinel",
          error:
            "Dieses PDF enthält keine zeugnio-Echtheitsmarker. Möglicherweise wurde es vor einem Update erstellt oder stammt nicht von zeugnix.ch. Bitte das aktuelle PDF herunterladen und erneut prüfen.",
        },
        { status: 200 },
      );
    }

    // 2. Kanonisieren (identische Pipeline wie beim Finalisieren) + SHA-256
    const canonical = canonicalizeForHash(rawBody);
    const calculatedHash = await sha256(canonical);

    // 3. In DB suchen
    const supabase = createServiceClient();
    const { data: match } = await supabase
      .from("certificates")
      .select("id, company_id, status")
      .eq("hash", calculatedHash)
      .eq("status", "final")
      .maybeSingle();

    let outcome: VerifyOutcome;
    if (match) {
      outcome = {
        result: "verified",
        matchedHash: calculatedHash,
        matchedCertificateId: match.id,
      };
    } else {
      // Wenn der eingehende Text einen Hash-Block enthält, könnten wir
      // dort auch einen "behaupteten Hash" finden und mismatch unterscheiden.
      // Hier vereinfacht: kein Match → unknown
      outcome = { result: "unknown", calculatedHash };
    }

    // 4. Verification-Eintrag protokollieren
    await supabase.from("verifications").insert({
      uploaded_file_path: "inline-text", // bei echtem Upload PDF-Pfad eintragen
      extracted_text: text.slice(0, 50000),
      extracted_canonical_content: canonical.slice(0, 50000),
      calculated_hash: calculatedHash,
      matched_certificate_id: match?.id ?? null,
      result: outcome.result,
      paid: false, // Bezahlung über Stripe-Webhook setzt paid=true
      user_email: userEmail ?? null,
    });

    return NextResponse.json(outcome);
  } catch (err: any) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
