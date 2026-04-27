import { createClient } from "@/lib/db/supabase-server";
import { notFound } from "next/navigation";
import { CertificateActions } from "@/components/app/certificate-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CertificateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cert } = await supabase
    .from("certificates")
    .select(
      `
      *,
      employees (*),
      companies (*),
      manager_invitations (*),
      evaluations (*)
    `,
    )
    .eq("id", id)
    .single();

  if (!cert) notFound();

  const employee = cert.employees;
  const company = cert.companies;
  const evaluations = cert.evaluations ?? [];
  const invitations = cert.manager_invitations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-600">
          {typeLabel(cert.type)}
        </div>
        <h1 className="headline-display mt-1 text-[28px] leading-tight">
          {employee.first_name} {employee.last_name}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          {employee.function_title} · {company.name}
        </p>
      </div>

      {/* Status-Fortschritt */}
      <div className="card p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          Status
        </div>
        <div className="mt-3 flex items-center gap-2">
          <StepBadge label="Erstellt" active />
          <Connector />
          <StepBadge
            label="Beurteilung"
            active={cert.status !== "draft"}
            current={cert.status === "pending_manager"}
          />
          <Connector />
          <StepBadge
            label="Generiert"
            active={cert.status === "final" || cert.status === "manager_submitted"}
            current={cert.status === "manager_submitted"}
          />
          <Connector />
          <StepBadge label="Final" active={cert.status === "final"} />
        </div>
      </div>

      {/* Aktionen */}
      <CertificateActions
        certificate={cert}
        evaluationCount={evaluations.length}
        invitationCount={invitations.length}
      />

      {/* Generierter Text */}
      {cert.generated_text && (
        <div className="card p-6">
          <h2 className="mb-4 text-[14px] font-medium tracking-tight">
            Generierter Zeugnistext
          </h2>
          <div className="whitespace-pre-wrap font-display text-[14px] leading-relaxed text-ink-800">
            {cert.generated_text}
          </div>

          {cert.hash && (
            <div className="mt-6 rounded-md border border-ink-200 bg-ink-50/60 p-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-petrol-700">
                SHA-256 Hash
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-ink-700">
                {cert.hash}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    schluss: "Schlusszeugnis",
    zwischen: "Zwischenzeugnis",
    funktionswechsel: "Funktionswechsel",
    vorgesetztenwechsel: "Vorgesetztenwechsel",
    interner_wechsel: "Interner Wechsel",
    reorganisation: "Reorganisation",
    wunsch_mitarbeiterin: "Wunsch der Mitarbeiterin",
    wunsch_mitarbeiter: "Wunsch des Mitarbeiters",
  };
  return map[t] ?? t;
}

function StepBadge({
  label,
  active,
  current,
}: {
  label: string;
  active?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`rounded-full px-3 py-1 text-[11px] font-medium ${
        current
          ? "bg-petrol-700 text-white"
          : active
            ? "bg-petrol-50 text-petrol-700"
            : "bg-ink-100 text-ink-500"
      }`}
    >
      {label}
    </div>
  );
}

function Connector() {
  return <div className="h-px flex-1 bg-ink-200" />;
}
