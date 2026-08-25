import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { certificateTypeLabel } from "@/lib/certificate/certificate-title";

// @react-pdf/renderer braucht die Node-Runtime (nicht Edge). Die Antwort darf
// nicht statisch gecacht werden, und die PDF-Erzeugung kann etwas dauern.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// SSRF-Härtung des Logo-Fetch: Logos liegen ausschliesslich im Supabase-Storage
// (gleicher Host wie NEXT_PUBLIC_SUPABASE_URL, z. B. <project>.supabase.co).
// Wir fetchen daher nur https-URLs auf genau diesen Host – sonst könnte eine
// manipulierte logo_url den Server zu beliebigen internen Adressen leiten.
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

const LOGO_FETCH_TIMEOUT_MS = 5000;
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

function isAllowedLogoUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (
      u.protocol === "https:" && SUPABASE_HOST !== "" && u.host === SUPABASE_HOST
    );
  } catch {
    return false;
  }
}

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

  if (cert.status !== "final" || !cert.hash) {
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

  // Unterzeichnende: zeugnis-spezifischer Override vor Firmenvorgabe.
  const signatories = resolveSignatories(cert, company);

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

  // Logo als Data-URL laden, falls Logo-URL vorhanden. SSRF-gehärtet:
  // nur erlaubte (Supabase-Storage-)URLs, mit Timeout und Grössenlimit. Ein
  // Problem beim Logo überspringt nur das Logo, bricht aber nicht den PDF-Build.
  let logoDataUrl: string | undefined;
  if (company.logo_url) {
    if (!isAllowedLogoUrl(company.logo_url)) {
      console.warn(
        "Logo-URL nicht erlaubt (SSRF-Schutz), wird übersprungen:",
        company.logo_url,
      );
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        LOGO_FETCH_TIMEOUT_MS,
      );
      try {
        // redirect: "manual" — die Allowlist prüft nur den ersten Hop. Würden
        // wir Redirects folgen, könnte eine (vom Owner frei setzbare) logo_url
        // auf dem Supabase-Host per 30x doch noch auf eine interne Adresse
        // zeigen. Ein Redirect wird daher als "Logo überspringen" behandelt.
        const res = await fetch(company.logo_url, {
          signal: controller.signal,
          redirect: "manual",
        });
        if (
          res.type === "opaqueredirect" ||
          (res.status >= 300 && res.status < 400)
        ) {
          console.warn(
            "Logo übersprungen: Weiterleitung nicht erlaubt (SSRF-Schutz)",
          );
        } else if (res.ok) {
          // Content-Length ist nur ein Vorab-Hinweis (vom Server fälschbar/weglassbar);
          // der eigentliche Schutz ist der Byte-Längen-Check nach arrayBuffer().
          const declaredLength = Number(
            res.headers.get("content-length") ?? "0",
          );
          if (declaredLength > MAX_LOGO_BYTES) {
            console.warn(
              "Logo übersprungen: Content-Length überschreitet Limit:",
              declaredLength,
            );
          } else {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_LOGO_BYTES) {
              console.warn(
                "Logo übersprungen: tatsächliche Grösse überschreitet Limit:",
                arrayBuffer.byteLength,
              );
            } else {
              const base64 = Buffer.from(arrayBuffer).toString("base64");
              const contentType =
                res.headers.get("content-type") ?? "image/png";
              logoDataUrl = `data:${contentType};base64,${base64}`;
            }
          }
        }
      } catch (err) {
        console.warn("Logo konnte nicht geladen werden:", err);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
  const certificateTitle = certificateTypeLabel(cert.type);

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
