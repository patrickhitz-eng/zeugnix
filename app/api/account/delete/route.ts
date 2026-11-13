import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
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
 *  2. Danach das Anmeldekonto bei Supabase Auth. Hat die Datenbankfunktion es
 *     schon mitgelöscht (gleiche Datenbank), meldet Supabase «nicht gefunden» –
 *     das ist dann kein Fehler.
 *
 * Die Funktion läuft mit dem Service-Client, weil die Kaskade auch eingefrorene
 * Zeugnisse berührt (Ersteller leeren). Wer gelöscht wird, kommt ausschliesslich
 * aus der Sitzung, nie aus der Anfrage.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { error: authError } = await service.auth.admin.deleteUser(user.id);
  if (authError && authError.status !== 404) {
    // Profil und Rechte sind weg; ein verbliebenes Anmeldekonto hat keinen
    // Zugriff mehr auf Daten. Trotzdem melden, damit es von Hand entfernt wird.
    logError("[loeschen] Anmeldekonto nicht gelöscht:", user.id, authError);
  }

  await supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
