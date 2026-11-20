import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { authMode, authSecret, SESSION_COOKIE } from "./config";
import { endSession, lookupSession } from "./store";
import { hmac, isTokenShape } from "./tokens";
import { logError } from "@/lib/log";

/**
 * zeugnio – «Wer ist angemeldet?» an EINER Stelle
 * ----------------------------------------------------------------------------
 * Bis Cutover B stand in rund 30 Dateien `supabase.auth.getUser()`. Jetzt rufen
 * sie alle `getSessionUser()` auf, und diese Funktion entscheidet nach dem
 * Schalter ZEUGNIO_AUTH (lib/auth/config.ts), wer die Frage beantwortet:
 *
 *   supabase   Supabase Auth, wie bisher (Netzaufruf nach Frankfurt)
 *   eigen      auth.sessions auf advisori01, über das Cookie
 *              __Host-zeugnio_session (Aufruf über 127.0.0.1)
 *
 * Zurück kommt in beiden Fällen nur `{ id, email }` oder `null`. Mehr hat
 * zeugnio von der Person nie gelesen.
 *
 * Die Identität stammt immer aus der geprüften Quelle, nie aus dem Inhalt
 * eines Cookies oder dem Rumpf einer Anfrage. Das Cookie ist nur der
 * Schlüssel, unter dem nachgeschlagen wird (Plan § 6.3).
 *
 * `cache()` aus React: innerhalb einer Server-Darstellung wird nur einmal
 * nachgeschlagen, auch wenn Layout und Seite beide fragen.
 */

export interface SessionUser {
  id: string;
  /** Wie bei Supabase optional typisiert; bei der eigenen Anmeldung immer gesetzt. */
  email?: string;
}

async function supabaseUser(): Promise<SessionUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Aus einer Server Component aufgerufen: die Middleware erneuert die Sitzung.
        }
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

/** Sitzungskennung aus dem Cookie, nur wenn sie die richtige Form hat. */
export async function currentSessionToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return isTokenShape(value) ? value : null;
}

async function eigenUser(): Promise<SessionUser | null> {
  const token = await currentSessionToken();
  if (!token) return null;
  try {
    const user = await lookupSession(hmac(authSecret(), "session", token));
    return user ? { id: user.id, email: user.email } : null;
  } catch (error) {
    // Nicht nachschlagbar heisst «nicht angemeldet», nie «angemeldet».
    logError("[auth] Sitzung nicht nachschlagbar:", error);
    return null;
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  return authMode() === "eigen" ? eigenUser() : supabaseUser();
});

/**
 * Beendet die Sitzung dieses Browsers in der Datenbank (eigene Anmeldung).
 * Das Cookie löscht die aufrufende Route selbst, weil nur sie die Antwort hat.
 */
export async function endCurrentSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  await endSession(hmac(authSecret(), "session", token));
}
