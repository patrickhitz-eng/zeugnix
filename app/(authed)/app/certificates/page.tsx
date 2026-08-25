import { createClient } from "@/lib/db/supabase-server";
import Link from "next/link";

export const metadata = { title: "Zeugnisse" };

export default async function CertificatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showArchived = view === "archived";
  const supabase = await createClient();

  let query = supabase
    .from("certificates")
    .select("id, type, status, created_at, finalized_at, hash, archived_at, employees(first_name, last_name, function_title)")
    .order("created_at", { ascending: false });

  query = showArchived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);

  const { data: certificates } = await query;

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

      {/* Ansicht-Umschalter */}
      <div className="flex items-center gap-1 text-[12.5px]">
        <Link
          href="/app/certificates"
          className={`rounded-md px-3 py-1.5 font-medium ${
            !showArchived
              ? "bg-petrol-50 text-petrol-700"
              : "text-ink-600 hover:bg-ink-50"
          }`}
        >
          Aktive
        </Link>
        <Link
          href="/app/certificates?view=archived"
          className={`rounded-md px-3 py-1.5 font-medium ${
            showArchived
              ? "bg-petrol-50 text-petrol-700"
              : "text-ink-600 hover:bg-ink-50"
          }`}
        >
          Archiv
        </Link>
      </div>

      {!certificates || certificates.length === 0 ? (
        <div className="card p-10 text-center text-[13px] text-ink-500">
          {showArchived
            ? "Keine archivierten Zeugnisse."
            : "Noch keine Zeugnisse erstellt."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-ink-50/60 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3 text-left">Mitarbeitende</th>
                <th className="px-5 py-3 text-left">Typ</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Erstellt</th>
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
                  <td className="px-5 py-3.5 text-ink-600">
                    {typeLabel(c.type)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3.5 text-ink-500">
                    {new Date(c.created_at).toLocaleDateString("de-CH")}
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
