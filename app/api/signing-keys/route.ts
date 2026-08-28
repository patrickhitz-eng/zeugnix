import { NextResponse } from "next/server";
import { publicKeyRegistry } from "@/lib/crypto/signing";

// node:crypto (Schlüssel exportieren) benötigt die Node-Runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/signing-keys
 *
 * Transparenz-/Offline-Verifikations-Endpoint (S2): veröffentlicht die
 * ÖFFENTLICHEN Ed25519-Schlüssel der Plattform (aktiv + zurückgezogene). Damit
 * kann jede/r die Signatur eines zeugnio-Zeugnisses unabhängig nachprüfen:
 *
 *   Nachricht = "zeugnio-cert-sig-v1:" + <v2-Hash aus dem PDF>
 *   Ed25519-Verify(Nachricht, Signatur aus dem PDF-Block, publicKeyPem)
 *
 * Es werden AUSSCHLIESSLICH öffentliche Schlüssel ausgegeben – nie der private.
 */
export async function GET() {
  const keys = publicKeyRegistry();
  return NextResponse.json(
    {
      algorithm: "Ed25519",
      payloadPrefix: "zeugnio-cert-sig-v1:",
      note: "Signiert wird der Präfix + der v2-Echtheitshash. Die Signatur liegt Base64-kodiert im unsichtbaren PDF-Block zwischen [[zeugnix:sig-start]] und [[zeugnix:sig-end]].",
      keys,
    },
    {
      headers: {
        // Öffentliche Schlüssel ändern sich selten; kurzes Caching ist ok.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
