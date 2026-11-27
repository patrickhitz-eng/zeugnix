import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";
import {
  GENERIC_SUBMIT_ERROR,
  parseSelfEvaluation,
  readJsonBody,
} from "@/lib/evaluations/submission";

const LOCKED_MESSAGE =
  "Finalisierte oder widerrufene Zeugnisse können nicht mehr bearbeitet werden";

/**
 * POST /api/certificates/[id]/evaluate-self
 *
 * Erlaubt dem eingeloggten User (z.B. KMU-Inhaber, der gleichzeitig
 * Führungskraft ist), die Beurteilung direkt selbst zu erfassen,
 * ohne den Umweg über E-Mail-Einladung und Token-Link.
 *
 * Body: { evaluations: Array<{ category, subcategory?, rating, free_text? }> }
 *
 * Gehärtet wie die Abgabe über den Einladungslink (Sicherheitstest
 * 24.11.2026, T7, Folge-PR):
 *   - Dasselbe strikte Schema (lib/evaluations/submission.ts), Body begrenzt.
 *   - Speichern in EINER Datenbankfunktion (Migration 046): Sperre auf dem
 *     Zeugnis, versiegelte Zeugnisse abgewiesen, nur die Selbstbeurteilung
 *     ersetzt (Abgaben über Einladungen bleiben), Status im selben Zug.
 *   - Datenbankfehler nur ins Server-Log, an den Browser eine allgemeine Meldung.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const read = await readJsonBody(req);
    if (!read.ok) {
      return read.tooLarge
        ? NextResponse.json({ error: "Anfrage zu gross" }, { status: 413 })
        : NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    const parsed = parseSelfEvaluation(read.body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = await createClient();

    // Zeugnis laden (RLS) und Recht prüfen, damit die Antworten 404/403 wie
    // in den übrigen Routen ausfallen. Die Funktion prüft unter der Sperre
    // ein zweites Mal.
    const { data: cert } = await supabase
      .from("certificates")
      .select("id, status, company_id")
      .eq("id", id)
      .maybeSingle();
    if (!cert) {
      return NextResponse.json(
        { error: "Zeugnis nicht gefunden oder kein Zugriff" },
        { status: 404 },
      );
    }
    if (!(await userHasCompanyPermission(supabase, cert.company_id, user.id, "edit"))) {
      return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
    }
    if (isCertificateLocked(cert.status)) {
      return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 409 });
    }

    const { data: code, error: rpcErr } = await supabase.rpc("zeugnio_save_self_evaluation", {
      p_certificate_id: id,
      p_submitted_by_email: user.email ?? "self",
      p_evaluations: parsed.evaluations,
    });
    if (rpcErr) {
      console.error("[evaluate-self] Speichern fehlgeschlagen:", rpcErr.message);
      return NextResponse.json({ error: GENERIC_SUBMIT_ERROR }, { status: 500 });
    }

    switch (code) {
      case "ok":
        return NextResponse.json({ ok: true });
      case "not_found":
        return NextResponse.json(
          { error: "Zeugnis nicht gefunden oder kein Zugriff" },
          { status: 404 },
        );
      case "forbidden":
        return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
      case "locked":
        return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 409 });
      case "invalid":
        return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
      default:
        console.error("[evaluate-self] Unerwartete Antwort der Speicherfunktion:", code);
        return NextResponse.json({ error: GENERIC_SUBMIT_ERROR }, { status: 500 });
    }
  } catch (err) {
    console.error("[evaluate-self] Unerwarteter Fehler:", err);
    return NextResponse.json({ error: GENERIC_SUBMIT_ERROR }, { status: 500 });
  }
}
