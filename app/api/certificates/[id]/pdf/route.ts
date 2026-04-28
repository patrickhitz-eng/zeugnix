import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { renderCertificatePdf } from "@/lib/pdf/certificate";

const TYPE_LABELS: Record<string, string> = {
  schluss: "Arbeitszeugnis",
  zwischen: "Zwischenzeugnis",
  funktionswechsel: "Arbeitszeugnis",
  vorgesetztenwechsel: "Arbeitszeugnis",
  interner_wechsel: "Arbeitszeugnis",
  reorganisation: "Arbeitszeugnis",
  wunsch_mitarbeiterin: "Arbeitszeugnis",
  wunsch_mitarbeiter: "Arbeitszeugnis",
};

/**
 * GET /api/certificates/[id]/pdf
 *
 * Generiert das Zeugnis-PDF on-the-fly mit:
 *  - Briefkopf inkl. Logo (falls vorhanden)
 *  - Vollständiger Firmenadresse rechts oben
 *  - Body: bevorzugt edited_text, sonst generated_text
 *  - Unterschriftsblock mit beiden Unterzeichnenden
 *  - Hash-Block + QR-Code
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
  if (cert.status !== "final" || !cert.hash) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht finalisiert" },
      { status: 400 },
    );
  }

  const company = cert.companies;
  const employee = cert.employees;

  // Logo als Data-URL laden, falls Logo-URL vorhanden
  let logoDataUrl: string | undefined;
  if (company.logo_url) {
    try {
      const res = await fetch(company.logo_url);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const contentType = res.headers.get("content-type") ?? "image/png";
        logoDataUrl = `data:${contentType};base64,${base64}`;
      }
    } catch (err) {
      console.warn("Logo konnte nicht geladen werden:", err);
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnix.ch";
  const certificateTitle = TYPE_LABELS[cert.type] ?? "Arbeitszeugnis";

  // Bevorzugt edited_text (manuell bearbeitet), sonst generated_text
  const bodyText = cert.edited_text || cert.generated_text || "";

  try {
    const buffer = await renderCertificatePdf({
      companyName: company.name,
      companyAddress: company.address ?? undefined,
      companyPostalCode: company.postal_code ?? undefined,
      companyCity: company.city ?? undefined,
      companyPhone: company.phone ?? undefined,
      companyEmail: company.email ?? undefined,
      companyWebsite: company.website ?? undefined,
      companyLogoDataUrl: logoDataUrl,

      employeeFirstName: employee.first_name,
      employeeLastName: employee.last_name,

      certificateTitle,
      bodyText,

      signatory1Name: company.signatory_1_name ?? undefined,
      signatory1Role: company.signatory_1_role ?? undefined,
      signatory2Name: company.signatory_2_name ?? undefined,
      signatory2Role: company.signatory_2_role ?? undefined,

      hash: cert.hash,
      baseUrl,
    });

    const fileName = `${certificateTitle}_${employee.last_name}_${employee.first_name}.pdf`;

    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
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
