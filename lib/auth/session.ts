import { cache } from "react";
import { cookies } from "next/headers";

import { authSecret, SESSION_COOKIE } from "./config";
import { endSession, lookupSession } from "./store";
import { hmac, isTokenShape } from "./tokens";
import { logError } from "@/lib/log";

/**
 * zeugnio – «Wer ist angemeldet?» an EINER Stelle
 * ----------------------------------------------------------------------------
 * Alle Routen, Seiten und der Datenclient fragen hier. Die Antwort kommt aus
 * auth.sessions auf advisori01, über das Cookie __Host-zeugnio_session
 * (Aufruf über 127.0.0.1). Bis Cutover B (23.11.2026) konnte hier auch
 * Supabase Auth antworten; seit B2 gibt es nur noch diesen Weg.
 *
 * Zurück kommt nur `{ id, email }` oder `null`. Mehr hat zeugnio von der
 * Person nie gelesen.
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
  /** Immer gesetzt; optional typisiert, weil Aufrufer den Fall «ohne Adresse» seit jeher abfangen. */
  email?: string;
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
  return eigenUser();
});

/**
 * Beendet die Sitzung dieses Browsers in der Datenbank.
 * Das Cookie löscht die aufrufende Route selbst, weil nur sie die Antwort hat.
 */
export async function endCurrentSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  await endSession(hmac(authSecret(), "session", token));
}
