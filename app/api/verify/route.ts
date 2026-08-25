import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  canonicalizeForHash,
  extractBodyBetweenSentinels,
  sha256,
  type VerifyOutcome,
} from "@/lib/hash/canonicalize";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { certificateTypeLabel } from "@/lib/certificate/certificate-title";

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
            "Dieses PDF enthält keine zeugnio-Echtheitsmarker. Möglicherweise wurde es vor einem Update erstellt oder stammt nicht von zeugnio.ch. Bitte das aktuelle PDF herunterladen und erneut prüfen.",
        },
        { status: 200 },
      );
    }

    // 2. Kanonisieren (identische Pipeline wie beim Finalisieren) + SHA-256
    const canonical = canonicalizeForHash(rawBody);
    const calculatedHash = await sha256(canonical);

    // 3. In DB suchen. Mitgeladen werden die Vergleichsfelder (S1a): Arbeitgeber
    //    und Unterzeichnende (beide AUSSERHALB des Hashes, also fälschbar) sowie
    //    Mitarbeiter/in, Typ und Ausstelldatum zum Bestätigen des Datensatzes.
    const supabase = createServiceClient();
    const { data: match } = await supabase
      .from("certificates")
      .select(
        "id, company_id, status, type, finalized_at, " +
          "signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role, " +
          "employees(first_name, last_name), " +
          "companies(name, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role)",
      )
      .eq("hash", calculatedHash)
      .eq("status", "final")
      .maybeSingle();

    let outcome: VerifyOutcome;
    if (match) {
      // PostgREST bettet die 1:1-Relationen als Objekt ein; defensiv auch den
      // Array-Fall (je nach Typ-Inferenz) abfangen.
      const employee = Array.isArray(match.employees)
        ? match.employees[0]
        : match.employees;
      const company = Array.isArray(match.companies)
        ? match.companies[0]
        : match.companies;

      const signatories = resolveSignatories(match, company ?? {});

      const issueDate = match.finalized_at
        ? new Date(match.finalized_at).toLocaleDateString("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : null;

      outcome = {
        result: "verified",
        matchedHash: calculatedHash,
        matchedCertificateId: match.id,
        certificate: {
          employeeName: [employee?.first_name, employee?.last_name]
            .filter(Boolean)
            .join(" "),
          employer: company?.name ?? "",
          documentType: certificateTypeLabel(match.type),
          issueDate,
          signatory1Name: signatories.signatory_1_name,
          signatory1Role: signatories.signatory_1_role,
          signatory2Name: signatories.signatory_2_name,
          signatory2Role: signatories.signatory_2_role,
        },
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
