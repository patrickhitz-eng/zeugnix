import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  canonicalizeForHash,
  extractBodyBetweenSentinels,
  extractMetaBetweenSentinels,
  extractSignatureBetweenSentinels,
  decodeMetaBlock,
  decodeSignatureBlock,
  hashBodyMetaV2,
  sha256,
  type VerifyOutcome,
} from "@/lib/hash/canonicalize";
import { verifyCertificateSignature } from "@/lib/crypto/signing";
import {
  VERIFY_SELECT_COLS,
  buildCertificateFields,
  findCertificateByHash,
} from "@/lib/verify/certificate-fields";
import { logError } from "@/lib/log";

// S2: node:crypto (Ed25519-Verifikation) benötigt die Node-Runtime (nicht Edge).
export const runtime = "nodejs";

// Öffentlicher, Service-Role-gestützter Endpunkt → Rate-Limit gegen DoS/Abuse.
const VERIFY_LIMIT = 20;
const VERIFY_WINDOW_MS = 60 * 1000;

/**
 * POST /api/verify
 *
 * Body: { text: string }
 *
 * Erwartet bereits aus PDF extrahierten Text. Die PDF-Extraktion selbst
 * läuft im Browser oder in einem separaten Endpoint, weil pdf-parse o.ä.
 * grosse Dependencies sind.
 *
 * Protokolliert wird nur Hash und Ergebnis, nie der Text: Das hochgeladene
 * Zeugnis enthält Personendaten Dritter, die wir für die Prüfung nicht
 * aufbewahren müssen (Fahrplan Marktstart, Schritt 7). Eine mitgeschickte
 * `userEmail` wird bewusst ignoriert.
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
    const { text } = body as { text?: string };

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

    // S2: kryptografische Signatur aus dem PDF verifizieren – OFFLINE, gegen den
    // öffentlichen Plattform-Schlüssel, unabhängig von der DB. Signiert wurde der
    // v2-Hash; wir prüfen die eingebettete Signatur gegen den aus DIESEM PDF
    // rekonstruierten metaHash. Gültig => „nur zeugnio konnte das ausstellen".
    // Fehlt der Block oder passt er nicht (Alt-Zeugnis, kein Schlüssel,
    // Manipulation), bleibt signatureValid false und die Prüfung fällt sauber auf
    // den Hash-Match zurück (Bestandsschutz).
    const rawSig = extractSignatureBetweenSentinels(text);
    const parsedSig = rawSig ? decodeSignatureBlock(rawSig) : null;
    const signatureValid =
      parsedSig !== null && metaHash !== null
        ? verifyCertificateSignature(metaHash, parsedSig.keyId, parsedSig.signature)
        : false;

    // 3. In DB suchen. Spalten und Suche teilt sich dieser Weg mit dem QR-Scan
    //    (lib/verify/certificate-fields.ts). Status bewusst NICHT auf 'final'
    //    gefiltert (H2): ein widerrufenes Zeugnis muss denselben Hash-Match
    //    finden, um korrekt als "revoked" statt fälschlich als "unknown"
    //    auszuweisen.
    const supabase = createServiceClient();

    // v2 zuerst (das vollständige Siegel), dann v1 (Bestandsschutz). Sequentiell
    // statt .in(), um Mehrdeutigkeit zu vermeiden, falls zwei Zeugnisse denselben
    // Body teilen (v1) und eines zusätzlich per v2 trifft.
    let match = metaHash ? await findCertificateByHash(supabase, metaHash) : null;
    if (!match) match = await findCertificateByHash(supabase, bodyHash);

    // S1b Fallback: kein Hash-Treffer, aber der Body deckt sich mit einem
    // registrierten v2-Zeugnis -> Meta (Kopf/Unterschriften) wurde getauscht
    // oder ist unlesbar. Gezielte "Feld-Mismatch"-Meldung statt "unbekannt".
    let isMismatch = false;
    if (!match) {
      const { data: bodyMatch } = await supabase
        .from("certificates")
        .select(VERIFY_SELECT_COLS)
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
      // Soll-Angaben für den Abgleich mit dem Papier, bei v2 aus dem
      // eingefrorenen meta_snapshot (siehe lib/verify/certificate-fields.ts).
      const certificateFields = {
        ...(await buildCertificateFields(supabase, match)),
        // S2: PDF trägt eine gültige, offline verifizierte zeugnio-Signatur.
        signatureValid,
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

    // 4. Verification-Eintrag protokollieren – ohne Text und ohne E-Mail.
    await supabase.from("verifications").insert({
      uploaded_file_path: "inline-text", // bei echtem Upload PDF-Pfad eintragen
      calculated_hash: calculatedHash,
      matched_certificate_id: match?.id ?? null,
      result: outcome.result,
      paid: false, // Bezahlung über Stripe-Webhook setzt paid=true
    });

    return NextResponse.json(outcome);
  } catch (err: any) {
    logError("[verify] Fehler:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
