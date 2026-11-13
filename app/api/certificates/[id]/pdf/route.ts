import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";
import { renderSealedCertificate } from "@/lib/certificate/render-sealed";

// @react-pdf/renderer braucht die Node-Runtime (nicht Edge). Die Antwort darf
// nicht statisch gecacht werden, und die PDF-Erzeugung kann etwas dauern.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/certificates/[id]/pdf
 *
 * Generiert das Zeugnis-PDF on-the-fly mit:
 *  - Briefkopf inkl. Logo (falls vorhanden)
 *  - Vollständiger Firmenadresse rechts oben
 *  - Body: bevorzugt edited_text, sonst generated_text
 *  - Unterschriftsblock mit beiden Unterzeichnenden
 *  - Hash-Block + QR-Code (abschaltbar in der Mastervorlage)
 *
 * Der Zusammenbau steht in lib/certificate/render-sealed.ts (gemeinsam mit
 * Word-Download und ZIP-Export).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json(
      { error: "Zeugnis nicht gefunden" },
      { status: 404 },
    );

  if (!(await userHasCompanyPermission(supabase, cert.company_id, user.id, "read")))
    return NextResponse.json({ error: permissionDeniedMessage("read") }, { status: 403 });

  // Auch nach Widerruf (H2) darf die ausstellende Firma das historische
  // Dokument weiterhin selbst herunterladen - nur die öffentliche Prüfung
  // markiert es als widerrufen.
  if (!isCertificateLocked(cert.status) || !cert.hash) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht finalisiert" },
      { status: 400 },
    );
  }

  try {
    const rendered = await renderSealedCertificate(supabase, cert, "pdf");
    return new NextResponse(new Uint8Array(rendered.buffer), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `inline; filename="${rendered.fileName}"`,
      },
    });
  } catch (err: any) {
    console.error("PDF-Generierung fehlgeschlagen:", err);
    return NextResponse.json(
      { error: err.message ?? "PDF-Generierung fehlgeschlagen" },
      { status: 500 },
    );
  }
}
