import { createClient } from "@/lib/db/supabase-server";
import { CompanyForm } from "@/components/forms/company-form";

export const metadata = { title: "Firma" };

export default async function CompanyPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="headline-display text-[28px] leading-tight">Firma</h1>
        <p className="mt-2 text-[14px] text-ink-600">
          Stammdaten und Logo Ihrer Firma. Diese werden im Briefkopf der
          Arbeitszeugnisse verwendet.
        </p>
      </div>

      {companies && companies.length > 0 && (
        <div className="card divide-y divide-ink-100">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-5">
              <div>
                <div className="text-[14px] font-medium">{c.name}</div>
                <div className="text-[12px] text-ink-500">
                  {c.address ?? "Keine Adresse hinterlegt"}
                </div>
              </div>
              {c.has_employer_badge && (
                <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[10.5px] font-medium text-navy-800">
                  Verified Certificate Employer
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-[14px] font-medium tracking-tight">
          Neue Firma anlegen
        </h2>
        <CompanyForm />
      </div>
    </div>
  );
}
