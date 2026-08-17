import { createClient } from "@/lib/db/supabase-server";
import { notFound, redirect } from "next/navigation";
import { ManagerEvaluationForm } from "@/components/forms/manager-evaluation-form";
import { SKILLS } from "@/lib/phrases/skills";
import type { EmployeeData, PhraseBlock } from "@/lib/phrases/engine";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Beurteilung erfassen" };

export default async function SelfEvaluatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*), evaluations(*)")
    .eq("id", id)
    .single();

  if (!cert) notFound();

  const employee = cert.employees;
  const company = cert.companies;

  // Bereits gespeicherte Beurteilung (falls die Person schon einmal bewertet
  // wurde) für die Vorbelegung des Formulars – so muss beim Nachbearbeiten nicht
  // alles neu gewählt werden.
  const initialEvaluations = (cert.evaluations ?? []).map((e: any) => ({
    category: e.category,
    rating: e.rating,
    free_text: e.free_text,
  }));

  // Skill-Bausteine (nur Beurteilungs-Kategorien) für die Live-Vorschau der
  // Satzbausteine clientseitig verfügbar machen.
  const { data: skillBlocks } = await supabase
    .from("phrase_blocks")
    .select("*")
    .eq("active", true)
    .in(
      "category",
      SKILLS.map((s) => s.key),
    );

  const employeeData: EmployeeData = {
    firstName: employee.first_name,
    lastName: employee.last_name,
    gender: employee.gender,
    functionTitle: employee.function_title,
    entryDate: employee.entry_date,
    exitDate: employee.exit_date ?? undefined,
    dateOfBirth: employee.date_of_birth ?? undefined,
    employmentPercentage: employee.employment_percentage ?? undefined,
    isManager: employee.is_manager,
  };
  // Zwischenzeugnis = Gegenwart, sonst Rückblick (Vergangenheit) – wie in der Engine.
  const tempus: "praesens" | "praeteritum" =
    cert.type === "zwischen" ? "praesens" : "praeteritum";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/app/certificates/${id}`}
          className="text-[12px] font-medium text-petrol-700 hover:underline"
        >
          ← Zurück zum Zeugnis
        </Link>
        <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-petrol-600">
          Beurteilung erfassen
        </div>
        <h1 className="headline-display mt-1 text-[28px] leading-tight">
          {employee.first_name} {employee.last_name}
        </h1>
        <p className="mt-1 text-[14px] text-ink-600">
          {employee.function_title} · {company.name}
        </p>
      </div>

      <div className="rounded-md bg-petrol-50 p-4 text-[13px] leading-relaxed text-petrol-800">
        <strong>Hinweis:</strong> Bewerten Sie die Person in jeder Kategorie auf
        einer Skala von ungenügend bis sehr gut. Aus Ihren Bewertungen erstellt
        die Plattform anschliessend den Zeugnistext.
      </div>

      <ManagerEvaluationForm
        certificateId={id}
        isManager={employee.is_manager}
        selfMode
        initialEvaluations={initialEvaluations}
        phraseBlocks={(skillBlocks ?? []) as PhraseBlock[]}
        employee={employeeData}
        tempus={tempus}
      />
    </div>
  );
}
