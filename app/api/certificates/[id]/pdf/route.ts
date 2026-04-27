import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { renderCertificatePdf } from "@/lib/pdf/certificate";

/**
 * GET /api/certificates/[id]/pdf
 *
 * Generiert das Zeugnis-PDF on-the-fly aus den DB-Daten und gibt es
 * als Download zurück. Funktioniert nur für finalisierte Zeugnisse.
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
  if (cert.status !== "final" || !cert.hash) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht finalisiert" },
      { status: 400 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnix.ch";

  try {
    const buffer = await renderCertificatePdf({
      companyName: cert.companies.name,
      companyAddress: [
        cert.companies.address,
        cert.companies.postal_code,
        cert.companies.city,
      ]
        .filter(Boolean)
        .join(", "),
      employeeFirstName: cert.employees.first_name,
      employeeLastName: cert.employees.last_name,
      bodyText: cert.generated_text ?? "",
      hash: cert.hash,
      baseUrl,
      location: cert.companies.city ?? "Zürich",
      date: cert.finalized_at ?? new Date().toISOString().split("T")[0],
    });

    const fileName = `Arbeitszeugnis_${cert.employees.last_name}_${cert.employees.first_name}.pdf`;

    // Buffer in Uint8Array konvertieren für NextResponse-Body
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
