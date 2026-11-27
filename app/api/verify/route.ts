import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { clientIpKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  canonicalizeForHash,
  canonicalizeForHashV3,
  extractBodyBetweenSentinels,
  extractMetaBetweenSentinels,
  extractSignatureBetweenSentinels,
  decodeMetaBlock,
  decodeSignatureBlock,
  hashBodyMetaV2,
  hashBodyMetaV3,
  sha256,
  type VerifyOutcome,
} from "@/lib/hash/canonicalize";
import { verifyCertificateSignature } from "@/lib/crypto/signing";
import {
  VERIFY_SELECT_COLS,
  buildCertificateFields,
  findCertificateByHash,
  findRegisterByBodyHash,
  matchedCertificateIdForLog,
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
      `verify:${clientIpKey(req)}`,
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
    //    Das PDF sagt nicht, mit welcher Version es versiegelt wurde. Wir
    //    rechnen darum alle Versionen nach und suchen jeden Hash. Jede Version
    //    trifft nur Zeugnisse, die mit genau ihr versiegelt wurden: v3 trägt
    //    ein eigenes Präfix, v2 und v1 unterscheiden sich durch den Meta-Teil.
    //    v1-Hash = nur Body (Kanonisierung v1).
    //    v2-Hash = Body + Meta-Block (Aussteller/Titel/Unterzeichnende, S1b),
    //              Kanonisierung v1.
    //    v3-Hash = wie v2, aber Kanonisierung v3, die jeden Strich bindet (T9).
    //    v2 und v3 nur, wenn das PDF einen Meta-Block enthält.
    const canonical = canonicalizeForHash(rawBody);
    const bodyHash = await sha256(canonical);
    const canonicalV3 = canonicalizeForHashV3(rawBody);

    const rawMeta = extractMetaBetweenSentinels(text);
    const parsedMeta = rawMeta ? decodeMetaBlock(rawMeta) : null;
    const metaHash = parsedMeta ? await hashBodyMetaV2(rawBody, parsedMeta) : null;
    const metaHashV3 = parsedMeta ? await hashBodyMetaV3(rawBody, parsedMeta) : null;

    // S2: kryptografische Signatur aus dem PDF verifizieren – OFFLINE, gegen den
    // öffentlichen Plattform-Schlüssel, unabhängig von der DB. Signiert wurde der
    // Siegel-Hash (v2 bzw. seit T9 v3); wir prüfen die eingebettete Signatur
    // gegen die aus DIESEM PDF rekonstruierten Hashes. Gültig => „nur zeugnio
    // konnte das ausstellen". Fehlt der Block oder passt er nicht (Alt-Zeugnis,
    // kein Schlüssel, Manipulation), bleibt signatureValid false und die Prüfung
    // fällt sauber auf den Hash-Match zurück (Bestandsschutz).
    const rawSig = extractSignatureBetweenSentinels(text);
    const parsedSig = rawSig ? decodeSignatureBlock(rawSig) : null;
    const signatureValid =
      parsedSig !== null &&
      [metaHashV3, metaHash].some(
        (h) => h !== null && verifyCertificateSignature(h, parsedSig.keyId, parsedSig.signature),
      );

    // 3. In DB suchen. Spalten und Suche teilt sich dieser Weg mit dem QR-Scan
    //    (lib/verify/certificate-fields.ts). Status bewusst NICHT auf 'final'
    //    gefiltert (H2): ein widerrufenes Zeugnis muss denselben Hash-Match
    //    finden, um korrekt als "revoked" statt fälschlich als "unknown"
    //    auszuweisen.
    const supabase = createServiceClient();

    // v3 zuerst (heutiges Siegel), dann v2 (vollständiges Siegel vor T9), dann
    // v1 (Bestandsschutz). Sequentiell statt .in(), um Mehrdeutigkeit zu
    // vermeiden, falls zwei Zeugnisse denselben Body teilen (v1) und eines
    // zusätzlich per v2/v3 trifft. `calculatedHash` ist der Hash, den wir dem
    // Prüfer zeigen und protokollieren: der getroffene, sonst der heutige
    // Siegel-Hash (v3), ohne Meta-Block der v1-Body-Hash.
    let match: any = null;
    let calculatedHash = metaHashV3 ?? bodyHash;
    for (const h of [metaHashV3, metaHash, bodyHash]) {
      if (!h) continue;
      match = await findCertificateByHash(supabase, h);
      if (match) {
        calculatedHash = h;
        break;
      }
    }

    // S1b Fallback: kein Hash-Treffer, aber der Body deckt sich mit einem
    // registrierten Zeugnis ab v2 -> Meta (Kopf/Unterschriften) wurde getauscht
    // oder ist unlesbar. Gezielte "Feld-Mismatch"-Meldung statt "unbekannt".
    // Versionsgerecht (T9): canonical_content ist nach der Version des
    // Zeugnisses kanonisiert. Ein v3-Zeugnis vergleichen wir nur mit dem
    // v3-Text, ein v2-Zeugnis nur mit dem v1-Text. Sonst könnte ein Text, dem
    // ein Strich fehlt, über die alte Kanonisierung als «Text echt» gelten.
    let isMismatch = false;
    const bodyFallbacks = [
      { canonical: canonicalV3, versions: { gte: 3 }, hash: metaHashV3 },
      { canonical, versions: { eq: 2 }, hash: metaHash },
    ] as const;
    for (const fb of bodyFallbacks) {
      if (match) break;
      let q = supabase
        .from("certificates")
        .select(VERIFY_SELECT_COLS)
        .eq("canonical_content", fb.canonical)
        .in("status", ["final", "revoked"]);
      q = "gte" in fb.versions
        ? q.gte("hash_version", fb.versions.gte)
        : q.eq("hash_version", fb.versions.eq);
      const { data: bodyMatch } = await q.limit(1).maybeSingle();
      if (bodyMatch) {
        match = bodyMatch;
        isMismatch = true;
        if (fb.hash) calculatedHash = fb.hash;
      }
    }
    // Dasselbe für gelöschte Zeugnisse (036): Das Register hält keinen Text,
    // aber den Hash über den Text (`body_hash`, nach der Version des Zeugnisses
    // kanonisiert). Trifft er, ist der Text echt und nur Kopf oder
    // Unterschriften wurden getauscht.
    if (!match) {
      const registerBodyMatch =
        (await findRegisterByBodyHash(supabase, await sha256(canonicalV3), 3)) ??
        (await findRegisterByBodyHash(supabase, bodyHash, 1));
      if (registerBodyMatch) {
        match = registerBodyMatch;
        isMismatch = true;
        const h = (registerBodyMatch.hash_version ?? 1) >= 3 ? metaHashV3 : metaHash;
        if (h) calculatedHash = h;
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
      // Register-Treffer (036) haben keine Zeile mehr in certificates.
      matched_certificate_id: matchedCertificateIdForLog(match),
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
