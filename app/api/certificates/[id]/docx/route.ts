import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";
import { renderSealedCertificate } from "@/lib/certificate/render-sealed";

// docx baut rein in JS (kein headless Chrome), braucht aber Node-APIs (Buffer,
// Dateizugriff fürs Logo). Antwort nicht cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/certificates/[id]/docx
 *
 * Erzeugt das Zeugnis als Word-Datei (.docx) – bearbeitbare Variante zum PDF.
 * Gleiche Zugriffs- und Finalisierungsregeln wie die PDF-Route: nur die
 * ausstellende Firma, nur finalisierte (gehashte) Zeugnisse. Der Zusammenbau
 * steht in lib/certificate/render-sealed.ts.
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userHasCompanyPermission(supabase, cert.company_id, user.id, "read")))
    return NextResponse.json({ error: permissionDeniedMessage("read") }, { status: 403 });

  if (!isCertificateLocked(cert.status) || !cert.hash) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht finalisiert" },
      { status: 400 },
    );
  }

  try {
    const rendered = await renderSealedCertificate(supabase, cert, "docx");
    return new NextResponse(new Uint8Array(rendered.buffer), {
      headers: {
        "Content-Type": rendered.contentType,
        // attachment: Word-Dateien lassen sich nicht sinnvoll inline anzeigen.
        "Content-Disposition": `attachment; filename="${rendered.fileName}"`,
      },
    });
  } catch (err: any) {
    console.error("Word-Generierung fehlgeschlagen:", err);
    return NextResponse.json(
      { error: err.message ?? "Word-Generierung fehlgeschlagen" },
      { status: 500 },
    );
  }
}
