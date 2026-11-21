import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authMode } from "@/lib/auth/config";
import { hasSupabaseSessionCookie } from "@/lib/auth/request-memo";
import { getSessionUser } from "@/lib/auth/session";

/**
 * GET /api/auth/status  →  { angemeldet: boolean }
 *
 * Für den Marketing-Header (Knopf «Zur App» statt «Anmelden»). Gibt bewusst
 * nichts ausser ja/nein zurück, keine Adresse und keine ID: Die Antwort geht an
 * Skripte auf öffentlichen Seiten.
 *
 * Die Antwort ist nur ein Hinweis für die Anzeige, keine Zugangsprüfung. Wer
 * auf «Zur App» klickt, kommt durch die Middleware, und die prüft richtig.
 * Darum unterscheiden sich die beiden Schalterstellungen:
 *
 *   supabase   Nur nachsehen, ob ein Supabase-Sitzungscookie da ist. KEIN
 *              getUser(): Der Header lädt auf jeder Marketing-Seite, und jeder
 *              Aufruf ginge sonst vom Server nach Frankfurt (Review PR #91).
 *              Eine abgelaufene Sitzung zeigt so kurz «Zur App», der Klick
 *              führt dann zur Anmeldung.
 *   eigen      Richtig nachschlagen. Das ist ein Aufruf über 127.0.0.1 und
 *              kostet fast nichts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let angemeldet = false;
  try {
    angemeldet =
      authMode() === "eigen"
        ? !!(await getSessionUser())
        : hasSupabaseSessionCookie((await cookies()).getAll());
  } catch {
    // nicht feststellbar: als abgemeldet behandeln
  }
  return NextResponse.json({ angemeldet }, { headers: { "Cache-Control": "no-store" } });
}
