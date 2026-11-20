import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { authMode } from "@/lib/auth/config";
import { clearedSessionCookie } from "@/lib/auth/cookie";
import { rejectForeignOrigin } from "@/lib/auth/route-guard";
import { endCurrentSession } from "@/lib/auth/session";
import { logError } from "@/lib/log";

/**
 * POST /api/auth/abmelden
 *
 * Abmelden für beide Schalterstellungen, damit der Knopf im Browser nur noch
 * eine Adresse kennt:
 *
 *   eigen      Zeile in auth.sessions löschen, Cookie löschen
 *   supabase   signOut() serverseitig; @supabase/ssr löscht dabei die sb-Cookies
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

  if (authMode() === "eigen") {
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });
    await supabase.auth.signOut().catch((error) => logError("[auth] Abmelden bei Supabase:", error));
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
