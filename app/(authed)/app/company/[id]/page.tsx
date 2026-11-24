import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { getCompanyPermissions } from "@/lib/auth/ownership";
import { loadAdminOrgIds } from "@/lib/company/overview";
import { resolveThemeFromCompany } from "@/lib/design/document-tokens";
import { emailDomain, isFreeMailDomain } from "@/lib/company/domain";
import { CompanyForm } from "@/components/forms/company-form";
import {
  CompanyDomainControls,
  type CompanyDomain,
} from "@/components/forms/company-domain-controls";
import { CompanyBadge } from "@/components/app/company-list";
import { NewCompanyButton } from "@/components/app/new-company";
import { SectionNav, type SectionLink } from "@/components/app/section-nav";

export const metadata = { title: "Firma" };

const ZEUGNISART: Record<string, string> = {
  schluss: "Schlusszeugnis",
  zwischen: "Zwischenzeugnis",
  arbeitsbestaetigung: "Arbeitsbestätigung",
};

/**
 * Eine Firma: Kopf mit Logo und Kennzahlen, links Sprungmarken, rechts das
 * bestehende Formular (ein Speichern-Knopf für alles).
 *
 * Wer bearbeiten darf, entscheidet wie bisher die Datenbank: Admin der
 * Organisation (alles inkl. Domain) oder Feinrecht «Firmendaten und Vorlage»
 * (Formular ohne Domain). Alle anderen sehen die Angaben nur lesend.
 */
export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ neu?: string }>;
}) {
  const { id } = await params;
  const { neu } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: company } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();

  const { adminOrgIds, canCreate } = await loadAdminOrgIds(supabase, user.id);
  const isAdmin = adminOrgIds.has(company.organization_id);
  const permissions = await getCompanyPermissions(supabase, id);
  const editable = isAdmin || permissions.has("company");
  const canSeal = permissions.has("seal");

  const [{ data: siblings }, { count: certificates }, { count: employees }, { data: domainRows }] =
    await Promise.all([
      supabase.from("companies").select("name"),
      supabase.from("certificates").select("id", { count: "exact", head: true }).eq("company_id", id),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", id),
      supabase
        .from("company_domains")
        .select("domain, method, status, verified_at")
        .eq("company_id", id)
        .order("domain", { ascending: true }),
    ]);
  const companyCount = (siblings ?? []).length;
  const domains: CompanyDomain[] = (domainRows ?? []).map((d: any) => ({
    domain: d.domain,
    method: d.method,
    status: d.status,
    verified_at: d.verified_at,
  }));
  const domainVerified = domains.some((d) => d.status === "verified");

  // Ein-Klick-Vorschlag für die Domain: die Domain der Anmelde-Adresse, ausser Freemail.
  const loginDomain = emailDomain(user.email);
  const loginIsFreeMail = isFreeMailDomain(loginDomain);
  const suggestedDomain = loginDomain && !loginIsFreeMail ? loginDomain : null;

  const theme = resolveThemeFromCompany(company);
  const showData = isAdmin || canSeal;
  const links: SectionLink[] = [
    { id: "stammdaten", label: "Stammdaten & Logo" },
    { id: "unterzeichnende", label: "Unterzeichnende" },
    { id: "vorlage", label: "Vorlage" },
    { id: "domain", label: "Domain" },
    ...(showData ? [{ id: "export", label: "Export & Löschen", danger: true }] : []),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {companyCount > 1 ? (
          <Link href="/app/company" className="text-[13px] text-ink-600 hover:text-petrol-700">
            ← Alle Firmen
          </Link>
        ) : (
          <span />
        )}
        {companyCount <= 1 && canCreate && (
          <NewCompanyButton existingNames={(siblings ?? []).map((s: any) => s.name)} />
        )}
      </div>

      <div className="flex items-center gap-4">
        <CompanyBadge name={company.name} logoUrl={company.logo_url} accent={theme.colors.brandAccent} size={56} />
        <div className="min-w-0">
          <h1 className="headline-display text-[28px] leading-tight">{company.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
            {(company.postal_code || company.city) && (
              <span>{[company.postal_code, company.city].filter(Boolean).join(" ")}</span>
            )}
            <span>
              {certificates ?? 0} {certificates === 1 ? "Zeugnis" : "Zeugnisse"}
            </span>
            <span>Domain {domainVerified ? "bestätigt" : "offen"}</span>
          </div>
        </div>
      </div>

      {neu && (
        <p className="mt-5 rounded-md border border-petrol-100 bg-petrol-50 px-4 py-3 text-[13px] text-petrol-800">
          Die Firma ist angelegt. Ergänzen Sie jetzt Logo, Unterzeichnende und Vorlage
          und speichern Sie unten.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-8">
        <aside>
          <SectionNav links={links} />
        </aside>

        <div className="min-w-0 space-y-6">
          {editable ? (
            <>
              {!isAdmin && (
                <p className="rounded-md border border-ink-200 bg-white px-4 py-3 text-[12.5px] text-ink-600">
                  Sie pflegen Firmendaten, Logo und Vorlage dieser Firma. Die Domain bestätigt
                  der Admin Ihrer Organisation.
                </p>
              )}
              <CompanyForm company={company} />
            </>
          ) : (
            <ReadOnly company={company} themeLabel={theme.label} accent={theme.colors.brandAccent} />
          )}

          <section id="domain" className="scroll-mt-6">
            {isAdmin ? (
              <CompanyDomainControls
                companyId={company.id}
                initialDomains={domains}
                suggestedDomain={suggestedDomain}
                loginIsFreeMail={loginIsFreeMail}
              />
            ) : (
              <div className="card p-5">
                <div className="text-[13px] font-medium tracking-tight">Domain</div>
                <p className="mt-1 text-[12.5px] text-ink-600">
                  {domainVerified
                    ? `Bestätigt: ${domains.filter((d) => d.status === "verified").map((d) => d.domain).join(", ")}.`
                    : "Noch keine Domain bestätigt."}{" "}
                  Die Domain bestätigt der Admin Ihrer Organisation.
                </p>
              </div>
            )}
          </section>

          {showData && (
            <section id="export" className="card scroll-mt-6 border-red-100 p-5">
              <div className="text-[13px] font-medium tracking-tight">Export & Löschen</div>
              <p className="mt-1 text-[12.5px] text-ink-600">
                An dieser Firma hängen {employees ?? 0}{" "}
                {employees === 1 ? "Person" : "Personen"} und {certificates ?? 0}{" "}
                {certificates === 1 ? "Zeugnis" : "Zeugnisse"}. Export und Löschen finden Sie
                gesammelt unter «Daten». Laden Sie vor dem Löschen den Export herunter.
              </p>
              <Link
                href={`/app/daten#firma-${company.id}`}
                className="mt-3 inline-block text-[13px] font-medium text-red-700 underline"
              >
                Firma exportieren oder löschen
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Angaben der Firma ohne Eingabefelder, für Personen ohne Bearbeitungsrecht. */
function ReadOnly({ company, themeLabel, accent }: { company: any; themeLabel: string; accent: string }) {
  const address = [company.address, [company.postal_code, company.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const signers = [
    [company.signatory_1_name, company.signatory_1_role],
    [company.signatory_2_name, company.signatory_2_role],
  ].filter(([name]) => name);

  return (
    <>
      <p className="rounded-md border border-ink-200 bg-white px-4 py-3 text-[12.5px] text-ink-600">
        Firmendaten, Logo und Unterzeichnende pflegt der Admin Ihrer Organisation.
      </p>
      <section id="stammdaten" className="card scroll-mt-6 p-5">
        <div className="mb-3 text-[13px] font-medium tracking-tight">Stammdaten</div>
        <Facts
          rows={[
            ["Firmenname", company.name],
            ["Adresse", address],
            ["Website", company.website],
            ["Telefon", company.phone],
            ["E-Mail", company.email],
          ]}
        />
      </section>
      <section id="unterzeichnende" className="card scroll-mt-6 p-5">
        <div className="mb-3 text-[13px] font-medium tracking-tight">Unterzeichnende Personen</div>
        {signers.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Keine hinterlegt.</p>
        ) : (
          <Facts rows={signers.map(([name, role]) => [role || "Unterzeichnend", name])} />
        )}
      </section>
      <section id="vorlage" className="card scroll-mt-6 p-5">
        <div className="mb-3 text-[13px] font-medium tracking-tight">Vorlage</div>
        <Facts
          rows={[
            ["Stil", themeLabel],
            ["Akzentfarbe", accent],
            ["Echtheitsnachweis im Dokument", company.show_verification_block === false ? "ausgeblendet" : "Hash und QR sichtbar"],
            ["Zeugnisart (Vorgabe)", ZEUGNISART[company.default_zeugnis_typ ?? ""] ?? null],
            ["Fusszeile", company.certificate_footer],
          ]}
        />
      </section>
    </>
  );
}

function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  const shown = rows.filter(([, v]) => v);
  if (shown.length === 0) return <p className="text-[12.5px] text-ink-500">Keine Angaben.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[200px_1fr]">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-500">{label}</dt>
          <dd className="whitespace-pre-line text-ink-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
