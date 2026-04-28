import { createClient } from "@/lib/db/supabase-server";
import { notFound } from "next/navigation";
import { CertificateActions } from "@/components/app/certificate-actions";
import { CertificateEditor } from "@/components/app/certificate-editor";
import { CertificatePreview } from "@/components/app/certificate-preview";
import Link from "next/link";

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

  const displayText = cert.edited_text || cert.generated_text || "";
  const isFinal = cert.status === "final";
  const hasText = !!cert.generated_text;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        {isFinal && cert.hash && (
          <a
            href={`/api/certificates/${cert.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="btn-primary flex shrink-0 items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PDF herunterladen
          </a>
        )}
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
            active={evaluations.length > 0 || cert.status !== "draft"}
            current={cert.status === "pending_manager"}
          />
          <Connector />
          <StepBadge
            label="Generiert"
            active={!!cert.generated_text}
            current={cert.status === "manager_submitted" && !cert.hash}
          />
          <Connector />
          <StepBadge label="Final" active={isFinal} />
        </div>
      </div>

      {/* Aktionen */}
      <CertificateActions
        certificate={cert}
        evaluationCount={evaluations.length}
        invitationCount={invitations.length}
      />

      {/* Editor + Preview Split-View */}
      {hasText && (
        <div>
          <h2 className="mb-3 text-[15px] font-medium tracking-tight">
            Zeugnistext bearbeiten und Vorschau
          </h2>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Editor */}
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Editor
              </div>
              <CertificateEditor
                certificateId={cert.id}
                generatedText={cert.generated_text ?? ""}
                initialEditedText={cert.edited_text}
                finalized={isFinal}
              />
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Vorschau (so wird das PDF aussehen)
              </div>
              <div className="overflow-x-auto">
                <CertificatePreview
                  company={company}
                  employee={employee}
                  type={cert.type}
                  text={displayText}
                  hash={cert.hash}
                />
              </div>
            </div>
          </div>

          {/* Hinweise */}
          {(!company.logo_url ||
            !company.signatory_1_name ||
            !employee.date_of_birth) && (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50/50 p-4">
              <div className="text-[12px] font-medium text-amber-900">
                Empfehlungen für ein professionelleres Zeugnis:
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-amber-800">
                {!company.logo_url && (
                  <li>
                    •{" "}
                    <Link
                      href="/app/company"
                      className="underline hover:text-amber-900"
                    >
                      Firmenlogo hochladen
                    </Link>
                  </li>
                )}
                {!company.signatory_1_name && (
                  <li>
                    •{" "}
                    <Link
                      href="/app/company"
                      className="underline hover:text-amber-900"
                    >
                      Unterzeichnende Personen erfassen
                    </Link>
                  </li>
                )}
                {!employee.date_of_birth && (
                  <li>
                    • Geburtsdatum der Mitarbeiterin / des Mitarbeiters fehlt
                  </li>
                )}
              </ul>
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
