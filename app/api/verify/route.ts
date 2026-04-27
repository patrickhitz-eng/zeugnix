import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import {
  canonicalizeRawText,
  sha256,
  type VerifyOutcome,
} from "@/lib/hash/canonicalize";

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
    const body = await req.json();
    const { text, userEmail } = body as { text?: string; userEmail?: string };

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Text zu kurz oder fehlt" },
        { status: 400 },
      );
    }

    // 1. Kanonisieren
    const canonical = canonicalizeRawText(text);

    // 2. SHA-256 berechnen
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
