/**
 * Ein ausgestelltes Zeugnis als PDF erzeugen – an EINER Stelle.
 *
 * Genutzt vom Einzel-Download (app/api/certificates/[id]/pdf) und vom
 * ZIP-Export einer Firma (app/api/companies/[id]/export), damit beide genau
 * dasselbe Dokument ausliefern.
 *
 * Einen Word-Export gibt es seit November 2026 nicht mehr: Eine bearbeitbare
 * Kopie eines versiegelten Zeugnisses passt nach jeder Änderung nicht mehr
 * zum Hash und untergräbt so die Prüfbarkeit.
 *
 * Rechte und Status prüft der Aufrufer. Erwartet eine Zeile aus
 * `certificates` mit `employees(*)` und `companies(*)`.
 */
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { resolveCertificatePresentation } from "@/lib/certificate/presentation";
import { loadCompanyLogo, toDataUrl, type LoadedLogo } from "@/lib/uploads/load-logo";
import { encodeMetaBlock, encodeSignatureBlock, toMetaFields } from "@/lib/hash/canonicalize";
import {
  SIGNOFF_BINDING_COLS,
  certificateTextHash,
  signoffBindingState,
  slotSignatory,
} from "@/lib/certificate/signoff-binding";

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

  // Bestätigte Unterzeichner-Freigaben pro Slot (E-Mail und Zeitpunkt). Nur
  // solche, die zum versiegelten Text und zum Namen im Unterschriftsfeld passen
  // (M3, lib/certificate/signoff-binding.ts). Eine veraltete Freigabe erscheint
  // nicht auf dem Dokument.
  const signoffBySlot: Record<number, { email: string; confirmedAt: string }> = {};
  {
    const textHash = await certificateTextHash(cert);
    const { data: signoffs } = await supabase
      .from("certificate_signoffs")
      .select(`email, ${SIGNOFF_BINDING_COLS}`)
      .eq("certificate_id", cert.id)
      .eq("status", "confirmed");
    for (const so of signoffs ?? []) {
      const slotNow = slotSignatory(signatories, so.slot);
      const state = signoffBindingState(so, {
        textHash,
        slotName: slotNow.name,
        slotRole: slotNow.role,
        finalizedAt: cert.finalized_at,
      });
      if (state === "bound" && so.confirmed_at && (so.slot === 1 || so.slot === 2)) {
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

  // S1b: unsichtbarer Meta-Block für Zeugnisse ab v2 (v2 und v3 decken die
  // Meta-Felder), aus dem eingefrorenen Snapshot. Ohne ihn könnte die Prüfung
  // den Siegel-Hash eines v3-Zeugnisses nicht nachrechnen.
  // S2: Signatur-Block aus dem gespeicherten Wert (nie neu signieren).
  const metaBlockEncoded =
    (cert.hash_version ?? 1) >= 2 && cert.meta_snapshot
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
