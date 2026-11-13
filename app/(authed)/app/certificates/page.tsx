import { createClient } from "@/lib/db/supabase-server";
import { CompanyFilter } from "@/components/app/company-filter";
import Link from "next/link";
import { Suspense } from "react";

export const metadata = { title: "Zeugnisse" };

export default async function CertificatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; firma?: string }>;
}) {
  const { view, firma } = await searchParams;
  const showArchived = view === "archived";
  const supabase = await createClient();

  // RLS liefert nur Firmen, auf die die Person Zugriff hat. Ein unbekannter
  // oder fremder ?firma= wird darum einfach ignoriert.
  const { data: companyRows } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });
  const companies = companyRows ?? [];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const selectedCompany = firma && companyName.has(firma) ? firma : null;
  const multipleCompanies = companies.length > 1;

  let query = supabase
    .from("certificates")
    .select("id, type, status, created_at, updated_at, finalized_at, hash, archived_at, company_id, employees(first_name, last_name, function_title)")
    .order("updated_at", { ascending: false });

  query = showArchived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  if (selectedCompany) query = query.eq("company_id", selectedCompany);

  const { data: certificates } = await query;

  const firmaQuery = selectedCompany ? `firma=${selectedCompany}` : "";
  const activeHref = firmaQuery ? `/app/certificates?${firmaQuery}` : "/app/certificates";
  const archivedHref = `/app/certificates?view=archived${firmaQuery ? `&${firmaQuery}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="headline-display text-[28px] leading-tight">
            Zeugnisse
          </h1>
          <p className="mt-2 text-[14px] text-ink-600">
            {showArchived
              ? "Archivierte Arbeitszeugnisse."
              : "Alle erstellten Arbeitszeugnisse."}
          </p>
        </div>
        <Link href="/app/certificates/new" className="btn-primary">
          Neues Zeugnis
        </Link>
      </div>

      {/* Ansicht-Umschalter und Firmenfilter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-[12.5px]">
          <Link
            href={activeHref}
            className={`rounded-md px-3 py-1.5 font-medium ${
              !showArchived
                ? "bg-petrol-50 text-petrol-700"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            Aktive
          </Link>
          <Link
            href={archivedHref}
            className={`rounded-md px-3 py-1.5 font-medium ${
              showArchived
                ? "bg-petrol-50 text-petrol-700"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            Archiv
          </Link>
        </div>
        {multipleCompanies && (
          <Suspense fallback={null}>
            <CompanyFilter companies={companies} selected={selectedCompany} />
          </Suspense>
        )}
      </div>

      {!certificates || certificates.length === 0 ? (
        <div className="card p-10 text-center text-[13px] text-ink-500">
          {selectedCompany
            ? showArchived
              ? "Keine archivierten Zeugnisse für diese Firma."
              : "Keine Zeugnisse für diese Firma."
            : showArchived
              ? "Keine archivierten Zeugnisse."
              : "Noch keine Zeugnisse erstellt."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-ink-50/60 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3 text-left">Mitarbeitende</th>
                {multipleCompanies && !selectedCompany && (
                  <th className="px-5 py-3 text-left">Firma</th>
                )}
                <th className="px-5 py-3 text-left">Typ</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Geändert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {certificates.map((c: any) => (
                <tr key={c.id} className="hover:bg-ink-50/30">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/app/certificates/${c.id}`}
                      className="font-medium hover:text-petrol-700"
                    >
                      {c.employees?.first_name} {c.employees?.last_name}
                    </Link>
                    <div className="text-[11.5px] text-ink-500">
                      {c.employees?.function_title}
                    </div>
                  </td>
                  {multipleCompanies && !selectedCompany && (
                    <td className="px-5 py-3.5 text-ink-600">
                      {companyName.get(c.company_id) ?? "–"}
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-ink-600">
                    {typeLabel(c.type)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td
                    className="px-5 py-3.5 text-ink-500"
                    title={`Erstellt am ${new Date(c.created_at).toLocaleDateString("de-CH")}`}
                  >
                    {new Date(c.updated_at ?? c.created_at).toLocaleDateString("de-CH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Entwurf", className: "bg-ink-100 text-ink-700" },
    pending_manager: {
      label: "Wartet auf FK",
      className: "bg-amber-50 text-amber-800",
    },
    manager_submitted: {
      label: "Bewertung erhalten",
      className: "bg-petrol-50 text-petrol-700",
    },
    final: { label: "Final", className: "bg-petrol-700 text-white" },
    revoked: { label: "Widerrufen", className: "bg-red-700 text-white" },
  };
  const c = map[status] ?? { label: status, className: "bg-ink-100 text-ink-700" };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}
