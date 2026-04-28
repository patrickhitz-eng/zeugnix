import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
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

  const employee = cert.employees;
  const company = cert.companies;
  const evals: any[] = cert.evaluations ?? [];

  if (evals.length === 0) {
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
    tasks: cert.tasks ?? [],
    thankEmployee: cert.thank_employee,
    location: company.city ?? "Zürich",
    date: new Date().toISOString().split("T")[0],
    companyName: company.name,
    companyAddress: company.address,
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

  // 4. Speichern
  await supabase
    .from("certificates")
    .update({
      generated_text: result.text,
      status: "manager_submitted",
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, text: result.text, warnings: result.warnings });
}
