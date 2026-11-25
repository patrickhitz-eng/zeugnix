import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { clearedSessionCookie } from "@/lib/auth/cookie";
import { getSessionUser } from "@/lib/auth/session";
import { endAllSessions } from "@/lib/auth/store";
import { deletionErrorStatus } from "@/lib/loeschen/rpc-error";
import { logError } from "@/lib/log";

/**
 * POST /api/account/delete   Body: { confirmEmail: string }
 *
 * Die angemeldete Person löscht ihr eigenes Konto (Schritt 17, AGB-Zusage).
 *
 * Ablauf:
 *  1. zeugnio_delete_account (036, nur service_role) prüft «letzte Admin-
 *     Person», protokolliert und löscht das Profil. Firmen und Zeugnisse, die
 *     sie angelegt hat, bleiben; das Ersteller-Feld wird leer.
 *     Auf advisori01 löscht sie auch die Zeile in auth.users (sofern die
 *     Rechte es erlauben) und damit (per Fremdschlüssel) alle Sitzungen.
 *  2. Danach alle Sitzungen der Person ausdrücklich beenden und das Cookie
 *     dieses Browsers löschen.
 *
 * Die Funktion läuft mit dem Service-Client, weil die Kaskade auch eingefrorene
 * Zeugnisse berührt (Ersteller leeren). Wer gelöscht wird, kommt ausschliesslich
 * aus der Sitzung, nie aus der Anfrage.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { confirmEmail?: unknown } | null;
  const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (!user.email || typed !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Bitte die eigene E-Mail-Adresse zur Bestätigung eingeben." }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.rpc("zeugnio_delete_account", { p_user_id: user.id });
  if (error) {
    const status = deletionErrorStatus(error);
    if (status === 500) logError("[loeschen] Konto nicht gelöscht:", error);
    return NextResponse.json({ error: status === 500 ? "Löschen fehlgeschlagen." : error.message }, { status });
  }

  // auth.users und damit auth.sessions sollten schon weg sein (siehe oben).
  // Trotzdem alle Sitzungen ausdrücklich beenden (Review PR #91): Die Kaskade
  // hängt an einem Fremdschlüssel, den eine spätere Änderung an
  // zeugnio_delete_account oder an auth.users still aushebeln könnte. Dann
  // blieben andere Geräte bis zu 30 Tage angemeldet, ohne Profil, aber mit
  // gültiger Sitzung. Schlägt dieser Aufruf fehl, ist das Konto trotzdem
  // gelöscht; die Sitzungen räumt dann die Kaskade bzw. auth_cleanup ab.
  try {
    await endAllSessions(user.id);
  } catch (endError) {
    logError("[loeschen] Sitzungen nicht beendet:", user.id, endError);
  }
  const res = NextResponse.json({ ok: true });
  const c = clearedSessionCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
