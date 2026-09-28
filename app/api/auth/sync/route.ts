import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { logError, logWarn } from "@/lib/log";

/**
 * POST /api/auth/sync
 *
 * Trägt die angemeldete Person in die eigene auth.users ein. Wird von
 * app/auth/callback/page.tsx aufgerufen, direkt nachdem die Sitzung steht.
 *
 * WARUM DAS NÖTIG IST
 *
 * Der Umzug läuft in zwei Schritten: erst die Daten auf den eigenen Server,
 * später die Anmeldung. In der Zeit dazwischen meldet Supabase an, die Daten
 * liegen aber schon hier – und unsere eigene auth.users erfährt von einer neuen
 * Anmeldung nichts. public.profiles.id hat aber einen Fremdschlüssel darauf
 * (supabase/001_initial_schema.sql:76). Ohne diese Route scheitert deshalb das
 * Anlegen des Profils, und zwar bei JEDER neuen Registrierung: die Anmeldung
 * gelingt, das Konto bleibt leer.
 *
 * Diese Route ist ausdrücklich vorübergehend. Nach Cutover B entsteht der
 * Benutzer zuerst hier, und ensure_auth_user sollte dann nur noch
 * "unverändert" zurückgeben. Meldet es danach weiter "angelegt", stimmt etwas
 * an der Reihenfolge nicht – darum wird das protokolliert.
 *
 * SICHERHEIT: Die Benutzer-ID und die Adresse stammen ausschliesslich aus der
 * geprüften Sitzung, nie aus dem Rumpf der Anfrage. Die Route nimmt bewusst
 * keine Eingabe an – sonst könnte jede angemeldete Person Konten für fremde
 * Adressen anlegen.
 */
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!user.email) {
    // Ohne Adresse lässt sich kein Profil anlegen: profiles.email ist not null.
    return NextResponse.json({ error: "Der Sitzung fehlt eine E-Mail-Adresse." }, { status: 400 });
  }

  // Ist keine eigene Daten-API eingerichtet, liegen die Daten noch bei Supabase –
  // dort legt GoTrue den Benutzer selbst an, und diese Route hat nichts zu tun.
  if (!process.env.DATA_API_URL?.trim()) {
    return NextResponse.json({ ok: true, ergebnis: "übersprungen" });
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("ensure_auth_user", {
      p_id: user.id,
      p_email: user.email,
    });

    if (error) {
      // 23505 = unique_violation: die Adresse gehört einem anderen Konto. Das ist
      // kein Serverfehler, sondern ein Fall, der eine klare Antwort braucht.
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        logWarn("[auth/sync] Adresse bereits einem anderen Konto zugeordnet");
        return NextResponse.json(
          {
            error:
              "Diese E-Mail-Adresse ist bereits einem anderen Konto zugeordnet. " +
              "Bitte beim Support melden.",
          },
          { status: 409 },
        );
      }
      logError("[auth/sync] ensure_auth_user fehlgeschlagen:", error);
      return NextResponse.json({ error: "Anmeldung konnte nicht abgeschlossen werden." }, { status: 500 });
    }

    if (data === "angelegt") {
      // Nach Cutover B darf das nicht mehr vorkommen, siehe Kopf dieser Datei.
      logWarn("[auth/sync] Benutzer in der eigenen auth.users neu angelegt");
    }

    return NextResponse.json({ ok: true, ergebnis: data ?? "unbekannt" });
  } catch (error) {
    logError("[auth/sync] unerwarteter Fehler:", error);
    return NextResponse.json({ error: "Anmeldung konnte nicht abgeschlossen werden." }, { status: 500 });
  }
}
