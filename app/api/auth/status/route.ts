import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";

/**
 * GET /api/auth/status  →  { angemeldet: boolean }
 *
 * Für den Marketing-Header (Knopf «Zur App» statt «Anmelden»). Gibt bewusst
 * nichts ausser ja/nein zurück, keine Adresse und keine ID: Die Antwort geht an
 * Skripte auf öffentlichen Seiten.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let angemeldet = false;
  try {
    angemeldet = !!(await getSessionUser());
  } catch {
    // nicht feststellbar: als abgemeldet behandeln
  }
  return NextResponse.json({ angemeldet }, { headers: { "Cache-Control": "no-store" } });
}
