import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { loadCompanyLogo, toDataUrl } from "@/lib/uploads/load-logo";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { resolveCertificatePresentation } from "@/lib/certificate/presentation";
import { isCertificateLocked } from "@/lib/certificate/status";
import {
  encodeMetaBlock,
  encodeSignatureBlock,
  toMetaFields,
} from "@/lib/hash/canonicalize";

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

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  // Auch nach Widerruf (H2) darf die ausstellende Firma das historische
  // Dokument weiterhin selbst herunterladen - nur die öffentliche Prüfung
  // markiert es als widerrufen.
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

  // Arbeitgeber, Titel und Unterzeichnende: bei einem v2-Zeugnis AUS DEM
  // eingefrorenen meta_snapshot, sonst zeugnis-spezifischer Override vor
  // Firmenvorgabe. Das PDF zeigt damit genau die Werte, über die sein Hash
  // gebildet wurde – auch wenn Firmenname oder Unterzeichnende der Firma
  // danach (legitim) geändert wurden. Siehe lib/certificate/presentation.ts.
  const presentation = resolveCertificatePresentation(cert, company);
  const signatories = presentation.signatories;

  // V2: bestaetigte Unterzeichner-Freigaben pro Slot (E-Mail + Zeitpunkt) laden.
  // Der Renderer zeigt sie als "✓ Bestaetigt am …" unter der Unterschrift.
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

  // Logo über lib/uploads/load-logo.ts: lokale Datei (seit dem Umzug der
  // Normalfall) oder – gehärtet – die Supabase-Adresse aus der Zeit davor.
  // Dasselbe Modul nutzt die Word-Route, damit beide Ausgaben dasselbe Logo
  // zeigen. Ein Problem beim Logo überspringt nur das Logo.
  const logo = await loadCompanyLogo(company.logo_url);
  const logoDataUrl = logo ? toDataUrl(logo) : undefined;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
  const certificateTitle = presentation.documentTitle;

  // S1b: unsichtbaren Meta-Block nur für v2-finalisierte Zeugnisse einbetten.
  // Quelle ist der beim Finalisieren EINGEFRORENE Snapshot – so bettet das PDF
  // exakt die Felder ein, über die der gespeicherte v2-Hash gebildet wurde
  // (immun gegen spätere Änderungen an Firmenname/Unterzeichnenden). Alt-/v1-
  // Zeugnisse (kein Snapshot) bekommen keinen Block und bleiben über v1 gültig.
  let metaBlockEncoded: string | undefined;
  if (cert.hash_version === 2 && cert.meta_snapshot) {
    metaBlockEncoded = encodeMetaBlock(toMetaFields(cert.meta_snapshot));
  }

  // S2: unsichtbaren Signatur-Block einbetten, sofern das Zeugnis beim
  // Finalisieren signiert wurde. Quelle ist der eingefrorene DB-Wert (nicht neu
  // signieren) – so trägt das PDF exakt die gespeicherte, unveränderliche
  // Signatur. Fehlt sie (Alt-Zeugnis / kein Schlüssel), kein Block.
  let signatureBlockEncoded: string | undefined;
  if (cert.signature && cert.signing_key_id) {
    signatureBlockEncoded = encodeSignatureBlock({
      keyId: cert.signing_key_id,
      signature: cert.signature,
    });
  }

  // Bevorzugt edited_text (manuell bearbeitet), sonst generated_text
  const bodyText = cert.edited_text || cert.generated_text || "";

  try {
    const buffer = await renderCertificatePdf({
      companyName: presentation.employer,
      companyAddress: company.address ?? undefined,
      companyPostalCode: company.postal_code ?? undefined,
      companyCity: company.city ?? undefined,
      companyPhone: company.phone ?? undefined,
      companyEmail: company.email ?? undefined,
      companyWebsite: company.website ?? undefined,
      companyLogoDataUrl: logoDataUrl,
      companyFooter: company.certificate_footer ?? undefined,

      employeeFirstName: employee.first_name,
      employeeLastName: employee.last_name,

      certificateTitle,
      bodyText,
      formattedContent: cert.formatted_content ?? null,
      themeId: company.default_certificate_font_family ?? undefined,

      // Zeugnis-Override ⟶ Firmenvorgabe (identisch zur A4-Vorschau).
      signatory1Name: signatories.signatory_1_name ?? undefined,
      signatory1Role: signatories.signatory_1_role ?? undefined,
      signatory2Name: signatories.signatory_2_name ?? undefined,
      signatory2Role: signatories.signatory_2_role ?? undefined,
      signatureMode: cert.signature_mode ?? undefined,

      // V2: identitaetsgebundene Freigaben (nur bestaetigte Slots gesetzt).
      signatory1Email: signoffBySlot[1]?.email,
      signatory1ConfirmedAt: signoffBySlot[1]?.confirmedAt,
      signatory2Email: signoffBySlot[2]?.email,
      signatory2ConfirmedAt: signoffBySlot[2]?.confirmedAt,

      // S1b: eingefrorener Meta-Block (nur v2-Zeugnisse).
      metaBlockEncoded,
      // S2: eingefrorener Signatur-Block (nur signierte Zeugnisse).
      signatureBlockEncoded,

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
