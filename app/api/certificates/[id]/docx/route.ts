import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import {
  contentTypeForFile,
  resolveLogoPath,
  segmentsFromLogoUrl,
} from "@/lib/uploads/logos";
import { renderCertificateDocx, type DocxLogo } from "@/lib/docx/certificate";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { certificateTypeLabel } from "@/lib/certificate/certificate-title";
import { isCertificateLocked } from "@/lib/certificate/status";

// docx baut rein in JS (kein headless Chrome), braucht aber Node-APIs (Buffer,
// Dateizugriff fürs Logo). Antwort nicht cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

function logoType(contentType: string): "png" | "jpg" | null {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return null;
}

/**
 * GET /api/certificates/[id]/docx
 *
 * Erzeugt das Zeugnis als Word-Datei (.docx) – bearbeitbare Variante zum PDF.
 * Gleiche Zugriffs- und Finalisierungsregeln wie die PDF-Route: nur die
 * ausstellende Firma, nur finalisierte (gehashte) Zeugnisse.
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

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (!isCertificateLocked(cert.status) || !cert.hash) {
    return NextResponse.json(
      { error: "Zeugnis ist nicht finalisiert" },
      { status: 400 },
    );
  }

  const company = cert.companies;
  const employee = cert.employees;
  if (!company || !employee) {
    return NextResponse.json(
      {
        error:
          "Zeugnis ist nicht vollständig verknüpft (Mitarbeitende oder Firma fehlt).",
      },
      { status: 400 },
    );
  }

  const signatories = resolveSignatories(cert, company);

  // Bestätigte Unterzeichner-Freigaben pro Slot (identisch zur PDF-Route).
  const signoffBySlot: Record<number, { email: string; confirmedAt: string }> = {};
  {
    const { data: signoffs } = await supabase
      .from("certificate_signoffs")
      .select("slot, email, confirmed_at, status")
      .eq("certificate_id", id)
      .eq("status", "confirmed");
    for (const so of signoffs ?? []) {
      if (so.confirmed_at && (so.slot === 1 || so.slot === 2)) {
        signoffBySlot[so.slot] = { email: so.email, confirmedAt: so.confirmed_at };
      }
    }
  }

  // Logo: nur die lokal abgelegten Dateien (seit dem Umzug der Normalfall,
  // siehe PDF-Route). Ein Logo, das noch als entfernte Supabase-URL vorliegt,
  // wird im Word-Export weggelassen – kein harter Fehler.
  let companyLogo: DocxLogo | null = null;
  const localLogo = company.logo_url ? segmentsFromLogoUrl(company.logo_url) : null;
  if (localLogo) {
    const file = resolveLogoPath(localLogo);
    if (file) {
      try {
        const bytes = await readFile(file);
        const type = logoType(contentTypeForFile(file));
        if (type && bytes.byteLength <= MAX_LOGO_BYTES) {
          companyLogo = { data: bytes, type };
        }
      } catch {
        // Fehlendes/unlesbares Logo überspringen – Dokument entsteht ohne Logo.
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
  const certificateTitle = certificateTypeLabel(cert.type);
  const bodyText = cert.edited_text || cert.generated_text || "";

  try {
    const buffer = await renderCertificateDocx({
      companyName: company.name,
      companyAddress: company.address ?? undefined,
      companyPostalCode: company.postal_code ?? undefined,
      companyCity: company.city ?? undefined,
      companyPhone: company.phone ?? undefined,
      companyEmail: company.email ?? undefined,
      companyWebsite: company.website ?? undefined,
      companyFooter: company.certificate_footer ?? undefined,
      companyLogo,

      employeeFirstName: employee.first_name,
      employeeLastName: employee.last_name,

      certificateTitle,
      bodyText,
      formattedContent: cert.formatted_content ?? null,
      themeId: company.default_certificate_font_family ?? undefined,

      signatory1Name: signatories.signatory_1_name ?? undefined,
      signatory1Role: signatories.signatory_1_role ?? undefined,
      signatory2Name: signatories.signatory_2_name ?? undefined,
      signatory2Role: signatories.signatory_2_role ?? undefined,
      signatureMode: cert.signature_mode ?? undefined,

      signatory1Email: signoffBySlot[1]?.email,
      signatory1ConfirmedAt: signoffBySlot[1]?.confirmedAt,
      signatory2Email: signoffBySlot[2]?.email,
      signatory2ConfirmedAt: signoffBySlot[2]?.confirmedAt,

      hash: cert.hash,
      baseUrl,
    });

    const fileName = `${certificateTitle}_${employee.last_name}_${employee.first_name}.docx`;
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        // attachment: Word-Dateien lassen sich nicht sinnvoll inline anzeigen.
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
