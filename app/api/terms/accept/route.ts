import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { logError } from "@/lib/log";

// Service-Client (require @supabase/supabase-js) -> Node-Runtime.
export const runtime = "nodejs";

/**
 * POST /api/terms/accept
 * Body: { version: string }
 *
 * Hält fest, dass die angemeldete Person die AGB in der Fassung `version`
 * angenommen hat (Fahrplan Marktstart, Schritt 11). Angenommen wird nur die
 * aktuelle Fassung: Wer eine ältere Seite offen hatte, muss neu laden und sieht
 * dann die neue. Den Zeitpunkt setzt die Datenbank.
 *
 * Schreiben läuft über den Service-Client NACH der Identitätsprüfung –
 * `authenticated` hat auf terms_acceptances keine Schreib-RLS (Migration 031).
 * Ein zweiter Klick ändert nichts (ignoreDuplicates), der erste Zeitpunkt bleibt.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { version?: string };
  if (body.version !== TERMS_VERSION) {
    return NextResponse.json(
      {
        error:
          "Die AGB wurden inzwischen aktualisiert. Bitte laden Sie die Seite neu.",
      },
      { status: 409 },
    );
  }

  const service = createServiceClient();
  const { error } = await service
    .from("terms_acceptances")
    .upsert(
      { user_id: user.id, terms_version: TERMS_VERSION },
      { onConflict: "user_id,terms_version", ignoreDuplicates: true },
    );

  if (error) {
    logError("[terms/accept] Speichern fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Die Zustimmung konnte nicht gespeichert werden. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
