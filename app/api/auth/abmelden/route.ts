import { NextResponse, type NextRequest } from "next/server";

import { clearedSessionCookie } from "@/lib/auth/cookie";
import { rejectForeignOrigin } from "@/lib/auth/route-guard";
import { endCurrentSession } from "@/lib/auth/session";
import { logError } from "@/lib/log";

/**
 * POST /api/auth/abmelden
 *
 * Zeile in auth.sessions löschen, Cookie löschen.
 *
 * Das Cookie wird auch dann gelöscht, wenn die Datenbank nicht antwortet: Der
 * Browser soll nach «Abmelden» in jedem Fall abgemeldet aussehen. Die Zeile
 * räumt auth_cleanup() spätestens nach Ablauf weg.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  try {
    await endCurrentSession();
  } catch (error) {
    logError("[auth] Abmelden: Sitzung nicht gelöscht:", error);
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const c = clearedSessionCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
