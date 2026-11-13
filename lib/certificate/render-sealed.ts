/**
 * Ein ausgestelltes Zeugnis als PDF oder Word erzeugen – an EINER Stelle.
 *
 * Genutzt von den Einzel-Downloads (app/api/certificates/[id]/pdf und /docx)
 * und vom ZIP-Export einer Firma (app/api/companies/[id]/export). Vorher
 * standen dieselben 80 Zeilen in beiden Routen; ein dritter Aufrufer hätte sie
 * ein drittes Mal kopiert, und die Ausgaben wären auseinandergelaufen.
 *
 * Rechte und Status prüft der Aufrufer. Erwartet eine Zeile aus
 * `certificates` mit `employees(*)` und `companies(*)`.
 */
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { renderCertificateDocx, type DocxLogo } from "@/lib/docx/certificate";
import { resolveCertificatePresentation } from "@/lib/certificate/presentation";
import { docxImageType, loadCompanyLogo, toDataUrl, type LoadedLogo } from "@/lib/uploads/load-logo";
import { encodeMetaBlock, encodeSignatureBlock, toMetaFields } from "@/lib/hash/canonicalize";

export type SealedFormat = "pdf" | "docx";

export interface RenderedCertificate {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * Logo einer Firma laden. Der Export ruft das einmal pro Firma auf und reicht
 * das Ergebnis an alle Zeugnisse weiter, statt es pro Datei neu zu lesen.
 */
export async function loadLogoForCompany(company: { logo_url?: string | null }): Promise<LoadedLogo | null> {
  return loadCompanyLogo(company.logo_url ?? null);
}

export async function renderSealedCertificate(
  supabase: any,
  cert: any,
  format: SealedFormat,
  preloadedLogo?: LoadedLogo | null,
): Promise<RenderedCertificate> {
  const company = cert.companies;
  const employee = cert.employees;
  if (!company || !employee) {
    throw new Error("Zeugnis ist nicht vollständig verknüpft (Mitarbeitende oder Firma fehlt).");
  }

  // Arbeitgeber, Titel und Unterzeichnende: bei einem v2-Zeugnis aus dem
  // eingefrorenen meta_snapshot, sonst Zeugnis-Override vor Firmenvorgabe.
  // Siehe lib/certificate/presentation.ts.
  const presentation = resolveCertificatePresentation(cert, company);
  const signatories = presentation.signatories;

  // Bestätigte Unterzeichner-Freigaben pro Slot (E-Mail und Zeitpunkt).
  const signoffBySlot: Record<number, { email: string; confirmedAt: string }> = {};
  {
    const { data: signoffs } = await supabase
      .from("certificate_signoffs")
      .select("slot, email, confirmed_at, status")
      .eq("certificate_id", cert.id)
      .eq("status", "confirmed");
    for (const so of signoffs ?? []) {
      if (so.confirmed_at && (so.slot === 1 || so.slot === 2)) {
        signoffBySlot[so.slot] = { email: so.email, confirmedAt: so.confirmed_at };
      }
    }
  }

  const logo = preloadedLogo === undefined ? await loadLogoForCompany(company) : preloadedLogo;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
  const certificateTitle = presentation.documentTitle;
  const bodyText = cert.edited_text || cert.generated_text || "";

  const common = {
    companyName: presentation.employer,
    companyAddress: company.address ?? undefined,
    companyPostalCode: company.postal_code ?? undefined,
    companyCity: company.city ?? undefined,
    companyPhone: company.phone ?? undefined,
    companyEmail: company.email ?? undefined,
    companyWebsite: company.website ?? undefined,
    companyFooter: company.certificate_footer ?? undefined,

    employeeFirstName: employee.first_name,
    employeeLastName: employee.last_name,

    certificateTitle,
    bodyText,
    formattedContent: cert.formatted_content ?? null,
    themeId: company.default_certificate_font_family ?? undefined,
    // Mastervorlage (034): eigene Akzentfarbe und sichtbarer Echtheitsnachweis.
    brandAccent: company.brand_accent ?? undefined,
    showVerificationBlock: company.show_verification_block !== false,

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
  };

  const baseName = `${certificateTitle}_${employee.last_name}_${employee.first_name}`;

  if (format === "pdf") {
    // S1b: unsichtbarer Meta-Block nur für v2-Zeugnisse, aus dem eingefrorenen
    // Snapshot. S2: Signatur-Block aus dem gespeicherten Wert (nie neu signieren).
    const metaBlockEncoded =
      cert.hash_version === 2 && cert.meta_snapshot
        ? encodeMetaBlock(toMetaFields(cert.meta_snapshot))
        : undefined;
    const signatureBlockEncoded =
      cert.signature && cert.signing_key_id
        ? encodeSignatureBlock({ keyId: cert.signing_key_id, signature: cert.signature })
        : undefined;

    const buffer = await renderCertificatePdf({
      ...common,
      companyLogoDataUrl: logo ? toDataUrl(logo) : undefined,
      metaBlockEncoded,
      signatureBlockEncoded,
    });
    return { buffer, fileName: `${baseName}.pdf`, contentType: "application/pdf" };
  }

  let companyLogo: DocxLogo | null = null;
  if (logo) {
    const type = docxImageType(logo);
    if (type) companyLogo = { data: logo.bytes, type };
    else console.warn("Logo-Art für Word nicht unterstützt, wird übersprungen:", logo.contentType);
  }
  const buffer = await renderCertificateDocx({ ...common, companyLogo });
  return {
    buffer,
    fileName: `${baseName}.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
