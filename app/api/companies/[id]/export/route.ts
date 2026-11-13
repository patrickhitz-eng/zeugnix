import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { permissionDeniedMessage, userHasCompanyPermission } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";
import { loadLogoForCompany, renderSealedCertificate } from "@/lib/certificate/render-sealed";
import { buildCsv } from "@/lib/export/csv";
import { buildZip, type ZipEntry } from "@/lib/export/zip";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jedes ausgestellte Zeugnis wird zweimal erzeugt (PDF und Word). Für die
// Firmengrössen der Pilotphase reicht eine Minute; mehr erlaubt nicht jeder
// Vercel-Plan.
export const maxDuration = 60;

/**
 * GET /api/companies/[id]/export
 *
 * Datenexport einer Firma als ZIP (Schritt 17), gedacht vor dem Löschen und
 * bei Vertragsende:
 *   pdf/…       alle ausgestellten Zeugnisse als PDF (weiter prüfbar)
 *   word/…      dieselben als Word (bearbeitbare Arbeitskopie)
 *   mitarbeitende.csv, zeugnisse.csv   Stammdaten und Status, auch Entwürfe
 *   LIESMICH.txt
 *
 * Darf, wer in der Firma versiegeln darf (HR-Leitung, Admin, Feinrecht).
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
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!(await userHasCompanyPermission(supabase, id, user.id, "seal"))) {
    return NextResponse.json({ error: permissionDeniedMessage("seal") }, { status: 403 });
  }

  const { data: company } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Firma nicht gefunden" }, { status: 404 });

  const [{ data: employees, error: employeesError }, { data: certificates, error: certificatesError }] =
    await Promise.all([
      supabase.from("employees").select("*").eq("company_id", id).order("last_name"),
      supabase
        .from("certificates")
        .select("*, employees(*), companies(*)")
        .eq("company_id", id)
        .order("created_at"),
    ]);
  if (employeesError || certificatesError) {
    logError("[export] Daten nicht lesbar:", employeesError, certificatesError);
    return NextResponse.json({ error: "Die Daten liessen sich nicht lesen." }, { status: 500 });
  }

  const entries: ZipEntry[] = [];
  const fileNames = new Map<string, { pdf: string; docx: string }>();
  const logo = await loadLogoForCompany(company);

  try {
    for (const cert of certificates ?? []) {
      if (!isCertificateLocked(cert.status) || !cert.hash) continue;
      // Kurze ID im Namen: Zwei Zeugnisse derselben Person (z. B. Zwischen- und
      // Schlusszeugnis gleichen Titels) dürfen sich nicht überschreiben.
      const suffix = String(cert.id).slice(0, 8);
      const pdf = await renderSealedCertificate(supabase, cert, "pdf", logo);
      const docx = await renderSealedCertificate(supabase, cert, "docx", logo);
      const pdfName = `pdf/${safeName(pdf.fileName, suffix)}`;
      const docxName = `word/${safeName(docx.fileName, suffix)}`;
      entries.push({ name: pdfName, data: pdf.buffer, compress: false });
      entries.push({ name: docxName, data: docx.buffer, compress: false });
      fileNames.set(cert.id, { pdf: pdfName, docx: docxName });
    }
  } catch (err: any) {
    logError("[export] Dokument nicht erzeugbar:", err);
    return NextResponse.json(
      { error: "Ein Dokument liess sich nicht erzeugen. Der Export wurde abgebrochen." },
      { status: 500 },
    );
  }

  entries.push({
    name: "mitarbeitende.csv",
    data: buildCsv(
      ["id", "vorname", "nachname", "anrede", "geburtsdatum", "funktion", "eintritt", "austritt", "pensum", "fuehrungsfunktion"],
      (employees ?? []).map((e: any) => [
        e.id, e.first_name, e.last_name, e.gender, e.date_of_birth, e.function_title,
        e.entry_date, e.exit_date, e.employment_percentage, e.is_manager,
      ]),
    ),
  });

  entries.push({
    name: "zeugnisse.csv",
    data: buildCsv(
      ["id", "mitarbeitende_id", "nachname", "vorname", "zeugnistyp", "status", "erstellt", "ausgestellt", "widerrufen", "hash", "datei_pdf", "datei_word"],
      (certificates ?? []).map((c: any) => [
        c.id, c.employee_id, c.employees?.last_name, c.employees?.first_name, c.zeugnis_typ ?? c.type,
        c.status, c.created_at, c.finalized_at, c.revoked_at, c.hash,
        fileNames.get(c.id)?.pdf, fileNames.get(c.id)?.docx,
      ]),
    ),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  entries.push({
    name: "LIESMICH.txt",
    data: [
      `Datenexport zeugnio – ${company.name}`,
      `Erstellt am ${stamp}`,
      "",
      "pdf/   Alle ausgestellten Zeugnisse. Die PDFs bleiben auf zeugnio.ch/verify prüfbar,",
      "       auch nachdem die Firma bei zeugnio gelöscht wurde (Prüfregister, 10 Jahre).",
      "word/  Dieselben Zeugnisse als Word-Datei. Bearbeitbar und darum nicht prüfbar.",
      "mitarbeitende.csv, zeugnisse.csv   Stammdaten und Status, auch von Entwürfen.",
      "       Trennzeichen Semikolon, Zeichensatz UTF-8 (öffnet direkt in Excel).",
      "",
      "Entwürfe haben keine Dokumente; ihr Text steht in zeugnio, solange die Firma besteht.",
      "",
    ].join("\r\n"),
  });

  const zip = buildZip(entries);
  const fileName = `zeugnio-export_${slug(company.name)}_${stamp}.zip`;
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Dateiname ohne Pfad- und Steuerzeichen, mit Kurz-ID vor der Endung. */
function safeName(fileName: string, suffix: string): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
  const dot = cleaned.lastIndexOf(".");
  return dot > 0 ? `${cleaned.slice(0, dot)}_${suffix}${cleaned.slice(dot)}` : `${cleaned}_${suffix}`;
}

/** ASCII-Kurzform für den Download-Namen (Content-Disposition ohne Sonderzeichen). */
function slug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "firma"
  );
}
