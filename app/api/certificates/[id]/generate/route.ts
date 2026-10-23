import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import { isCertificateLocked } from "@/lib/certificate/status";
import {
  generateCertificate,
  type EmployeeData,
  type CertificateData,
  type Evaluation,
  type PhraseBlock,
} from "@/lib/phrases/engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Zeugnis + Employee + Company laden
  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*), evaluations(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  // Nach der Finalisierung ist generated_text Teil des Siegels (Migration 029)
  // und DB-seitig gesperrt. Ohne diese Prüfung liefe die ganze Generierung
  // durch und scheiterte erst am Trigger – mit HTTP 500 und einer rohen
  // DB-Meldung. Dieselbe Antwort wie in content/, text/ und schlusssatz/.
  if (isCertificateLocked(cert.status)) {
    return NextResponse.json(
      { error: "Finalisierte oder widerrufene Zeugnisse können nicht mehr bearbeitet werden" },
      { status: 400 },
    );
  }

  const employee = cert.employees;
  const company = cert.companies;
  const evals: any[] = cert.evaluations ?? [];

  if (!employee || !company) {
    return NextResponse.json(
      {
        error:
          "Zeugnis ist nicht vollständig verknüpft (Mitarbeitende oder Firma fehlt).",
      },
      { status: 400 },
    );
  }

  // Arbeitsbestätigung braucht keine Beurteilung (kein Qualitativ-Teil).
  if (evals.length === 0 && cert.zeugnis_typ !== "arbeitsbestaetigung") {
    return NextResponse.json(
      {
        error:
          "Keine Beurteilungen vorhanden. Führungskraft muss erst beurteilen.",
      },
      { status: 400 },
    );
  }

  // 2. Phrase-Blocks laden
  const { data: phraseBlocks } = await supabase
    .from("phrase_blocks")
    .select("*")
    .eq("active", true);

  const employeeData: EmployeeData = {
    firstName: employee.first_name,
    lastName: employee.last_name,
    gender: employee.gender,
    functionTitle: employee.function_title,
    entryDate: employee.entry_date,
    exitDate: employee.exit_date,
    dateOfBirth: employee.date_of_birth,
    employmentPercentage: employee.employment_percentage,
    isManager: employee.is_manager,
  };

  const certData: CertificateData = {
    type: cert.type,
    zeugnisTyp: cert.zeugnis_typ ?? undefined,
    austrittsgrund: cert.austrittsgrund ?? null,
    wertschaetzung: cert.wertschaetzungsgrad ?? null,
    optinBedauern: cert.optin_bedauern ?? false,
    optinReorg: cert.optin_reorg ?? false,
    optinVorgesetztenwechsel: cert.optin_vorgesetztenwechsel ?? false,
    optinInternerWechsel: cert.optin_interner_wechsel ?? false,
    tasks: cert.tasks ?? [],
    thankEmployee: cert.thank_employee,
    location: company.city ?? "Zürich",
    date: new Date().toISOString().split("T")[0],
    companyName: company.name,
    companyAddress: company.address,
    newFunctionTitle: cert.new_function_title || undefined,
    newCompanyName: cert.new_company_name || undefined,
    transitionDate: cert.transition_date || undefined,
  };

  const evaluations: Evaluation[] = evals.map((e: any) => ({
    category: e.category,
    subcategory: e.subcategory,
    rating: e.rating,
    freeText: e.free_text,
  }));

  // 3. Generieren
  const result = generateCertificate(
    employeeData,
    certData,
    evaluations,
    (phraseBlocks ?? []) as PhraseBlock[],
  );

  // 4. Speichern – Schreibfehler auswerten, sonst ginge der generierte Text
  // verloren, während die UI "generiert" meldet.
  const { error: saveErr } = await supabase
    .from("certificates")
    .update({
      generated_text: result.text,
      status: "manager_submitted",
    })
    .eq("id", id);

  if (saveErr) {
    return NextResponse.json(
      { error: `Zeugnistext konnte nicht gespeichert werden: ${saveErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, text: result.text, warnings: result.warnings });
}
