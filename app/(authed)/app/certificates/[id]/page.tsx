import { createClient } from "@/lib/db/supabase-server";
import { notFound } from "next/navigation";
import { CertificateActions } from "@/components/app/certificate-actions";
import {
  CertificateSignoffControls,
  type SignoffSlot,
} from "@/components/app/certificate-signoff-controls";
import { SchlusssatzControls } from "@/components/forms/schlusssatz-controls";
import { SignatoryControls } from "@/components/forms/signatory-controls";
import { CertificateRichWorkspace } from "@/components/app/certificate-rich-workspace";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { CertificateWorkspace } from "@/components/app/certificate-workspace";
import { CertificateManage } from "@/components/app/certificate-manage";
import { isCertificateLocked } from "@/lib/certificate/status";
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

  // Pflicht-Joins: ohne Mitarbeitende oder Firma ist das Zeugnis nicht
  // darstellbar (Datensatz inkonsistent) – freundliche Fehlerseite statt Crash.
  if (!employee || !company) {
    return (
      <div className="card border-amber-200 bg-amber-50/40 p-6">
        <h1 className="text-[16px] font-medium text-amber-900">
          Zeugnis unvollständig
        </h1>
        <p className="mt-2 text-[13.5px] text-amber-800">
          Zu diesem Zeugnis fehlen verknüpfte Stammdaten
          {!employee ? " (Mitarbeitende)" : ""}
          {!employee && !company ? " und" : ""}
          {!company ? " (Firma)" : ""}. Bitte prüfen Sie die Mitarbeitenden- und
          Firmendaten oder legen Sie das Zeugnis neu an.
        </p>
        <Link
          href="/app/certificates"
          className="mt-4 inline-block text-[13px] font-medium text-petrol-700 underline"
        >
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const evaluations = cert.evaluations ?? [];
  const invitations = cert.manager_invitations ?? [];

  const isFinal = cert.status === "final";
  const isRevoked = cert.status === "revoked";
  // Editier-Sperre der Formulare: gilt fuer 'final' UND 'revoked' (revoked ist
  // "final und mehr", nie weniger gesperrt) - sonst wuerden Schlusssatz-/
  // Unterzeichner-/Editor-Formulare fuer ein widerrufenes Zeugnis wieder
  // freigeschaltet.
  const isLocked = isCertificateLocked(cert.status);
  const hasText = !!cert.generated_text;
  const isArchived = !!cert.archived_at;

  // Verlauf (H3): Statuswechsel-Historie, wird automatisch per DB-Trigger
  // befüllt (supabase/021_revocation_and_audit_log.sql). Nur lesend, kein
  // eigener Client nötig.
  const { data: auditLog } = await supabase
    .from("audit_log")
    .select("action, old_status, new_status, note, created_at, profiles(full_name, email)")
    .eq("certificate_id", id)
    .order("created_at", { ascending: false });

  // Effektive Unterzeichnende: Zeugnis-Override ⟶ Firmenvorgabe (pro Slot).
  // Speist Vorschau (previewCompany) und den Empfehlungs-Hinweis unten.
  const effectiveSignatories = resolveSignatories(cert, company);
  const previewCompany = { ...company, ...effectiveSignatories };

  // V2: Freigaben separat (nicht als Embed) laden – so bricht eine noch nicht
  // eingespielte Migration 020 nicht die ganze Detailseite, sondern blendet nur
  // die Freigabe-Karte aus (data bleibt null bei fehlender Tabelle).
  const { data: signoffData } = await supabase
    .from("certificate_signoffs")
    .select("slot, email, name, status, confirmed_at, sent_at")
    .eq("certificate_id", id);
  const signoffs = signoffData ?? [];

  // Unterschrifts-Slots mit hinterlegtem Namen -> Freigabe möglich.
  const signoffSlots: SignoffSlot[] = [];
  if (effectiveSignatories.signatory_1_name) {
    signoffSlots.push({
      slot: 1,
      name: effectiveSignatories.signatory_1_name,
      role: effectiveSignatories.signatory_1_role,
    });
  }
  if (effectiveSignatories.signatory_2_name) {
    signoffSlots.push({
      slot: 2,
      name: effectiveSignatories.signatory_2_name,
      role: effectiveSignatories.signatory_2_role,
    });
  }

  return (
    <div className="space-y-6">
      {isRevoked && (
        <div className="rounded-md border border-red-200 bg-red-50/70 px-4 py-2.5 text-[12.5px] text-red-800">
          Dieses Zeugnis wurde widerrufen
          {cert.revoked_at
            ? ` am ${new Date(cert.revoked_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}`
            : ""}
          . Die Prüfung auf zeugnio.ch zeigt das dauerhaft an.
          {cert.revocation_reason ? ` Grund: ${cert.revocation_reason}` : ""}
        </div>
      )}
      {isArchived && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[12.5px] text-amber-800">
          Dieses Zeugnis ist archiviert und erscheint nicht in der
          Standardübersicht.
        </div>
      )}
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
        {isLocked && cert.hash && (
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
          <StepBadge label="Final" active={isLocked} />
        </div>
      </div>

      {/* Aktionen + Editor teilen sich einen Workspace, damit Finalisieren den
          ausstehenden Auto-Save des Editors flushen kann. */}
      <CertificateWorkspace>
      {/* Aktionen */}
      <CertificateActions
        certificate={cert}
        evaluationCount={evaluations.length}
        invitationCount={invitations.length}
      />

      {/* Schlusssatz-Leiste: zwischen Aktionen-Panel und Vorschau. Nur für
          schluss/zwischen (Arbeitsbestätigung hat keinen Schlusssatz; Alt-Zeugnisse
          ohne zeugnis_typ nutzen weiterhin den Legacy-Schlusszweig). */}
      {(cert.zeugnis_typ === "schluss" || cert.zeugnis_typ === "zwischen") && (
        <SchlusssatzControls
          certificateId={cert.id}
          zeugnisTyp={cert.zeugnis_typ}
          finalized={isLocked}
          subject={{
            firstName: employee.first_name,
            lastName: employee.last_name,
            gender: employee.gender,
          }}
          initial={{
            austrittsgrund: cert.austrittsgrund ?? null,
            wertschaetzung: cert.wertschaetzungsgrad ?? null,
            optinBedauern: cert.optin_bedauern ?? false,
            optinReorg: cert.optin_reorg ?? false,
            optinVorgesetztenwechsel: cert.optin_vorgesetztenwechsel ?? false,
            optinInternerWechsel: cert.optin_interner_wechsel ?? false,
            newFunctionTitle: cert.new_function_title ?? null,
            newCompanyName: cert.new_company_name ?? null,
            transitionDate: cert.transition_date ?? null,
          }}
        />
      )}

      {/* Unterzeichnende pro Zeugnis: direkt unter dem Schlusssatz. Überschreibt
          die Firmenvorgabe nur für dieses Zeugnis (leer = Firmenvorgabe). */}
      <SignatoryControls
        certificateId={cert.id}
        finalized={isLocked}
        companyDefaults={{
          signatory1Name: company.signatory_1_name ?? "",
          signatory1Role: company.signatory_1_role ?? "",
          signatory2Name: company.signatory_2_name ?? "",
          signatory2Role: company.signatory_2_role ?? "",
        }}
        initial={{
          signatory1Name: cert.signatory_1_name ?? "",
          signatory1Role: cert.signatory_1_role ?? "",
          signatory2Name: cert.signatory_2_name ?? "",
          signatory2Role: cert.signatory_2_role ?? "",
        }}
        initialSignatureMode={cert.signature_mode ?? "digital"}
      />

      {/* V2: identitätsgebundene Unterzeichner-Freigabe. Erst sinnvoll, wenn ein
          Text zum Freigeben existiert und mindestens eine Person hinterlegt ist. */}
      {hasText && signoffSlots.length > 0 && (
        <CertificateSignoffControls
          certificateId={cert.id}
          slots={signoffSlots}
          initialSignoffs={signoffs}
        />
      )}

      {/* Editor + Preview Split-View */}
      {hasText && (
        <div className="mt-6">
          <h2 className="mb-3 text-[15px] font-medium tracking-tight">
            Zeugnistext bearbeiten und Vorschau
          </h2>
          <CertificateRichWorkspace
            certificateId={cert.id}
            generatedText={cert.generated_text ?? ""}
            initialFormattedContent={cert.formatted_content ?? null}
            finalized={isLocked}
            themeId={company.default_certificate_font_family}
            company={previewCompany}
            employee={employee}
            type={cert.type}
            hash={cert.hash}
            signatureMode={cert.signature_mode}
          />

          {/* Hinweise */}
          {(!company.logo_url ||
            !effectiveSignatories.signatory_1_name ||
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
                {!effectiveSignatories.signatory_1_name && (
                  <li>
                    •{" "}
                    <Link
                      href="/app/company"
                      className="underline hover:text-amber-900"
                    >
                      Unterzeichnende Personen erfassen
                    </Link>{" "}
                    (oder pro Zeugnis oben festlegen)
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
      </CertificateWorkspace>

      {/* Verwaltung: Archivieren / Löschen / Widerrufen */}
      <CertificateManage
        certificateId={cert.id}
        status={cert.status}
        archived={isArchived}
      />

      {/* Verlauf (H3): automatisch protokollierte Statuswechsel */}
      {auditLog && auditLog.length > 0 && (
        <div className="card border-ink-100 p-6">
          <h2 className="mb-4 text-[14px] font-medium tracking-tight">Verlauf</h2>
          <ul className="space-y-2.5">
            {auditLog.map((entry: any, i: number) => {
              const actor = Array.isArray(entry.profiles)
                ? entry.profiles[0]
                : entry.profiles;
              return (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 border-b border-ink-50 pb-2.5 text-[12.5px] last:border-0 last:pb-0"
                >
                  <div>
                    <span className="font-medium text-ink-800">
                      {auditActionLabel(entry.action)}
                    </span>
                    <span className="text-ink-500">
                      {" "}
                      — {actor?.full_name || actor?.email || "System"}
                    </span>
                    {entry.note && (
                      <div className="mt-0.5 text-[11.5px] text-ink-500">
                        Grund: {entry.note}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-[11px] text-ink-400">
                    {new Date(entry.created_at).toLocaleString("de-CH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    finalized: "Finalisiert",
    revoked: "Widerrufen",
    status_changed: "Status geändert",
  };
  return map[action] ?? action;
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
    arbeitsbestaetigung: "Arbeitsbestätigung",
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
