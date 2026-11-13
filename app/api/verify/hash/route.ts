import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  normalizeVerifyHash,
  type HashLookupCertificateFields,
  type HashLookupOutcome,
} from "@/lib/hash/canonicalize";
import { verifyCertificateSignature } from "@/lib/crypto/signing";
import {
  buildCertificateFields,
  findCertificateByHash,
  matchedCertificateIdForLog,
} from "@/lib/verify/certificate-fields";
import { logError } from "@/lib/log";

// node:crypto (Ed25519-Verifikation) braucht die Node-Runtime, nicht Edge.
export const runtime = "nodejs";

// Eigener Zähler neben dem PDF-Abgleich (`verify:<IP>`), gleiche Grösse. Raten
// ist bei 2^256 möglichen Hashes ausgeschlossen; das Limit schützt nur den
// Service-Client vor Last.
const LOOKUP_LIMIT = 20;
const LOOKUP_WINDOW_MS = 60 * 1000;

/**
 * POST /api/verify/hash
 *
 * Body: { hash: string }  (SHA-256 als 64 Hex-Zeichen, aus dem QR-Code)
 *
 * Schlägt ein Zeugnis über den Hash im QR-Code nach. Wer scannt, sieht so
 * sofort Status und Soll-Angaben, ohne das PDF hochzuladen.
 *
 * Was das beweist: Zu diesem Hash ist ein Zeugnis registriert. Was es NICHT
 * beweist: dass das Papier in der Hand denselben Text trägt. Ein QR-Code lässt
 * sich auf ein anderes Blatt kopieren. Den Text bindet erst der PDF-Abgleich
 * (POST /api/verify); die Seite bietet ihn darum als zweiten Schritt an.
 *
 * POST statt GET, damit der Hash nicht in der Anfrage-URL und damit nicht in
 * Zugriffsprotokollen steht. Aus demselben Grund trägt der QR-Code den Hash im
 * Fragment (siehe buildVerifyUrl).
 *
 * Protokolliert wird wie beim PDF-Abgleich nur Hash und Ergebnis, markiert mit
 * `uploaded_file_path = 'qr-hash'`, ohne IP.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(
      `verify-hash:${getClientIp(req)}`,
      LOOKUP_LIMIT,
      LOOKUP_WINDOW_MS,
    );
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const raw = (body as { hash?: unknown } | null)?.hash;
    const hash = normalizeVerifyHash(typeof raw === "string" ? raw : null);
    if (!hash) {
      return NextResponse.json(
        { error: "Ungültiger Prüfwert. Erwartet werden 64 Zeichen (0–9, a–f)." },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const match = await findCertificateByHash(supabase, hash);

    let outcome: HashLookupOutcome;
    if (match) {
      // Gespeicherte Signatur gegen den gespeicherten Hash prüfen. Signiert wird
      // beim Finalisieren der v2-Hash, und genau der steht in `hash` und damit
      // im QR-Code. Fehlt die Signatur (Alt-Zeugnis, kein Schlüssel), ist das
      // "none" und kein Fehler.
      let signatureState: HashLookupCertificateFields["signatureState"] = "none";
      if (match.signature && match.signing_key_id) {
        signatureState = verifyCertificateSignature(
          match.hash,
          match.signing_key_id,
          match.signature,
        )
          ? "valid"
          : "invalid";
      }

      const certificate: HashLookupCertificateFields = {
        ...(await buildCertificateFields(supabase, match)),
        signatureValid: signatureState === "valid",
        signatureState,
        signingKeyId: match.signing_key_id ?? null,
      };

      // Widerruf ist ein reiner Statuswechsel. revocation_reason bewusst NICHT
      // mitgegeben: interne HR-Information.
      outcome =
        match.status === "revoked"
          ? {
              result: "revoked",
              hash,
              revokedAt: match.revoked_at ?? null,
              certificate,
            }
          : { result: "verified", hash, certificate };
    } else {
      outcome = { result: "unknown", hash };
    }

    await supabase.from("verifications").insert({
      uploaded_file_path: "qr-hash",
      calculated_hash: hash,
      // Register-Treffer (036) haben keine Zeile mehr in certificates.
      matched_certificate_id: matchedCertificateIdForLog(match),
      result: outcome.result,
      paid: false,
    });

    return NextResponse.json(outcome);
  } catch (err: any) {
    logError("[verify/hash] Fehler:", err);
    return NextResponse.json(
      { error: "Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen." },
      { status: 500 },
    );
  }
}
