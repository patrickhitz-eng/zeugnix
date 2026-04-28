import { createClient } from "@/lib/db/supabase-server";
import { CompanyForm } from "@/components/forms/company-form";

export const metadata = { title: "Firma" };

export default async function CompanyPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  const hasCompanies = companies && companies.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="headline-display text-[28px] leading-tight">Firma</h1>
        <p className="mt-2 text-[14px] text-ink-600">
          Stammdaten, Logo und unterzeichnende Personen. Diese werden im
          Briefkopf und Unterschriftsblock der Arbeitszeugnisse verwendet.
        </p>
      </div>

      {hasCompanies && (
        <div className="space-y-8">
          {companies.map((c: any) => (
            <div key={c.id}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[16px] font-medium tracking-tight">
                  {c.name}
                </h2>
                {c.has_employer_badge && (
                  <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[10.5px] font-medium text-navy-800">
                    Verified Certificate Employer
                  </span>
                )}
              </div>
              <CompanyForm company={c} />
            </div>
          ))}
        </div>
      )}

      {!hasCompanies && (
        <div>
          <h2 className="mb-4 text-[16px] font-medium tracking-tight">
            Erste Firma anlegen
          </h2>
          <CompanyForm />
        </div>
      )}

      {hasCompanies && (
        <details className="rounded-md border border-ink-200 bg-white p-5">
          <summary className="cursor-pointer text-[13px] font-medium">
            Weitere Firma anlegen
          </summary>
          <div className="mt-5">
            <CompanyForm />
          </div>
        </details>
      )}
    </div>
  );
}
