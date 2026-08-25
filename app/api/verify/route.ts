import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  canonicalizeForHash,
  extractBodyBetweenSentinels,
  extractMetaBetweenSentinels,
  decodeMetaBlock,
  hashBodyMetaV2,
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
    const limited = await rateLimit(
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

    // 2. Kanonisieren (identische Pipeline wie beim Finalisieren) + Hashes.
    //    v1-Hash = nur Body. v2-Hash = Body + Meta-Block (Aussteller/Titel/
    //    Unterzeichnende), sofern das PDF einen Meta-Block enthält (S1b).
    const canonical = canonicalizeForHash(rawBody);
    const bodyHash = await sha256(canonical);

    const rawMeta = extractMetaBetweenSentinels(text);
    const parsedMeta = rawMeta ? decodeMetaBlock(rawMeta) : null;
    const metaHash = parsedMeta ? await hashBodyMetaV2(rawBody, parsedMeta) : null;

    // Der "berechnete Hash", den wir dem Prüfer zeigen/protokollieren: bei einem
    // Meta-Block der v2-Hash (das eigentliche Siegel), sonst der v1-Body-Hash.
    const calculatedHash = metaHash ?? bodyHash;

    // 3. In DB suchen. Mitgeladen werden die Vergleichsfelder (S1a): Arbeitgeber
    //    und Unterzeichnende sowie Mitarbeiter/in, Typ und Ausstelldatum zum
    //    Bestätigen des Datensatzes. Status bewusst NICHT auf 'final' gefiltert
    //    (H2): ein widerrufenes Zeugnis muss denselben Hash-Match finden, um
    //    korrekt als "revoked" statt fälschlich als "unknown" auszuweisen.
    const supabase = createServiceClient();
    const SELECT_COLS =
      "id, company_id, status, type, hash, hash_version, finalized_at, revoked_at, " +
      "signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role, " +
      "employees(first_name, last_name), " +
      "companies(name, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role)";

    async function findByHash(h: string) {
      const { data } = await supabase
        .from("certificates")
        .select(SELECT_COLS)
        .eq("hash", h)
        .in("status", ["final", "revoked"])
        .limit(1)
        .maybeSingle();
      return data;
    }

    // v2 zuerst (das vollständige Siegel), dann v1 (Bestandsschutz). Sequentiell
    // statt .in(), um Mehrdeutigkeit zu vermeiden, falls zwei Zeugnisse denselben
    // Body teilen (v1) und eines zusätzlich per v2 trifft.
    let match = metaHash ? await findByHash(metaHash) : null;
    if (!match) match = await findByHash(bodyHash);

    // S1b Fallback: kein Hash-Treffer, aber der Body deckt sich mit einem
    // registrierten v2-Zeugnis -> Meta (Kopf/Unterschriften) wurde getauscht
    // oder ist unlesbar. Gezielte "Feld-Mismatch"-Meldung statt "unbekannt".
    let isMismatch = false;
    if (!match) {
      const { data: bodyMatch } = await supabase
        .from("certificates")
        .select(SELECT_COLS)
        .eq("canonical_content", canonical)
        .in("status", ["final", "revoked"])
        .limit(1)
        .maybeSingle();
      if (bodyMatch && (bodyMatch.hash_version ?? 1) >= 2) {
        match = bodyMatch;
        isMismatch = true;
      }
    }

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

      // V1-Trust-Signal: Hat die ausstellende Firma eine verifizierte Domain?
      // Liegt AUSSERHALB des Hashes; dient dem Prüfer als Aussteller-Beleg.
      let verifiedDomain: string | null = null;
      if (match.company_id) {
        const { data: dom } = await supabase
          .from("company_domains")
          .select("domain")
          .eq("company_id", match.company_id)
          .eq("status", "verified")
          .order("verified_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        verifiedDomain = dom?.domain ?? null;
      }

      // V2-Trust-Signal: identitaetsgebundene Unterzeichner-Freigaben, die per
      // Magic-Link bestaetigt wurden. Datum pro Slot; die bestaetigende E-Mail
      // bleibt aus Datenschutzgruenden ausserhalb der oeffentlichen Antwort.
      let signatory1ConfirmedAt: string | null = null;
      let signatory2ConfirmedAt: string | null = null;
      {
        const { data: signoffs } = await supabase
          .from("certificate_signoffs")
          .select("slot, confirmed_at")
          .eq("certificate_id", match.id)
          .eq("status", "confirmed");
        for (const so of signoffs ?? []) {
          const formatted = so.confirmed_at
            ? new Date(so.confirmed_at).toLocaleDateString("de-CH", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : null;
          if (so.slot === 1) signatory1ConfirmedAt = formatted;
          if (so.slot === 2) signatory2ConfirmedAt = formatted;
        }
      }

      const issueDate = match.finalized_at
        ? new Date(match.finalized_at).toLocaleDateString("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : null;

      const certificateFields = {
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
        verifiedDomain,
        signatory1ConfirmedAt,
        signatory2ConfirmedAt,
        // S1b: 2 = Aussteller/Titel/Unterzeichnende sind vom Hash gedeckt.
        sealVersion: match.hash_version ?? 1,
      };

      // Reihenfolge der Fälle: Mismatch (Body echt, Meta-Siegel gebrochen) vor
      // Widerruf/Verified. Widerruf ist ein reiner Statuswechsel (kein Hash-
      // Bestandteil). revocation_reason bewusst NICHT mitgegeben: interne HR-Info.
      if (isMismatch) {
        outcome = {
          result: "mismatch",
          matchedCertificateId: match.id,
          calculatedHash,
          certificate: certificateFields,
        };
      } else if (match.status === "revoked") {
        outcome = {
          result: "revoked",
          matchedHash: match.hash ?? calculatedHash,
          matchedCertificateId: match.id,
          revokedAt: match.revoked_at ?? null,
          certificate: certificateFields,
        };
      } else {
        outcome = {
          result: "verified",
          matchedHash: match.hash ?? calculatedHash,
          matchedCertificateId: match.id,
          certificate: certificateFields,
        };
      }
    } else {
      // Weder ein Hash-Treffer (v2/v1) noch ein Body-Treffer (Mismatch-Fallback):
      // das Dokument ist auf zeugnio.ch nicht registriert.
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
