import { createServiceClient } from "@/lib/db/supabase-server";
import { notFound } from "next/navigation";
import { ManagerEvaluationForm } from "@/components/forms/manager-evaluation-form";
import { SKILLS } from "@/lib/phrases/skills";
import type { EmployeeData, PhraseBlock } from "@/lib/phrases/engine";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;

  // Mit Service Client laden, weil dies eine öffentliche (token-basierte) Seite ist
  const supabase = createServiceClient();

  const { data: inv } = await supabase
    .from("manager_invitations")
    .select(
      "*, certificates(*, employees(*), companies(*))",
    )
    .eq("token", token)
    .single();

  if (!inv) notFound();

  if (new Date(inv.expires_at) < new Date()) {
    return (
      <Wrapper>
        <h1 className="headline-display text-[24px]">Einladung abgelaufen</h1>
        <p className="mt-3 text-[14px] text-ink-600">
          Diese Einladung ist nicht mehr gültig. Bitte fordern Sie eine neue
          Einladung beim Arbeitgeber an.
        </p>
      </Wrapper>
    );
  }

  if (inv.status === "submitted") {
    return (
      <Wrapper>
        <h1 className="headline-display text-[24px]">Bereits eingereicht</h1>
        <p className="mt-3 text-[14px] text-ink-600">
          Sie haben Ihre Beurteilung bereits abgegeben. Vielen Dank.
        </p>
      </Wrapper>
    );
  }

  const cert: any = inv.certificates;
  const employee: any = cert?.employees;
  const company: any = cert?.companies;

  // Verknüpfte Stammdaten fehlen → freundlicher Hinweis statt White-Screen.
  if (!cert || !employee || !company) {
    return (
      <Wrapper>
        <h1 className="headline-display text-[24px]">Einladung nicht verfügbar</h1>
        <p className="mt-3 text-[14px] text-ink-600">
          Zu dieser Einladung fehlen Angaben. Bitte fordern Sie eine neue
          Einladung beim Arbeitgeber an.
        </p>
      </Wrapper>
    );
  }

  // Status auf 'viewed' updaten (best-effort: blockiert die Anzeige nicht)
  const { error: viewErr } = await supabase
    .from("manager_invitations")
    .update({ status: "viewed", viewed_at: new Date().toISOString() })
    .eq("id", inv.id);
  if (viewErr) {
    console.warn("[invitations] viewed-Update fehlgeschlagen:", viewErr.message);
  }

  // Skill-Bausteine für die Live-Vorschau (Service-Client umgeht RLS in diesem
  // öffentlichen Token-Flow – ein anonymer Manager ist nicht 'authenticated').
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
  const tempus: "praesens" | "praeteritum" =
    cert.type === "zwischen" ? "praesens" : "praeteritum";

  return (
    <Wrapper>
      <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-600">
        Beurteilung
      </div>
      <h1 className="headline-display mt-1 text-[28px] leading-tight">
        {employee.first_name} {employee.last_name}
      </h1>
      <p className="mt-1 text-[14px] text-ink-600">
        {employee.function_title} bei {company.name}
      </p>

      <div className="mt-8 rounded-md bg-petrol-50 p-4 text-[13px] leading-relaxed text-petrol-800">
        <strong>So funktioniert's:</strong> Bewerten Sie die Person in jeder
        Kategorie auf einer Skala von ungenügend bis sehr gut. Die Plattform
        erstellt daraus den Zeugnistext – Sie müssen nichts selbst
        formulieren.
      </div>

      <div className="mt-8">
        <ManagerEvaluationForm
          token={token}
          certificateId={cert.id}
          isManager={employee.is_manager}
          phraseBlocks={(skillBlocks ?? []) as PhraseBlock[]}
          employee={employeeData}
          tempus={tempus}
        />
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-zx flex h-14 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="container-zx max-w-2xl py-12">{children}</main>
    </div>
  );
}
