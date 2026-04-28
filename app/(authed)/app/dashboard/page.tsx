import { createClient } from "@/lib/db/supabase-server";
import Link from "next/link";

export const metadata = { title: "Übersicht" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Stats laden
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .limit(5);

  const { data: certificates } = await supabase
    .from("certificates")
    .select("id, status, created_at, employees(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(10);

  const draftCount =
    certificates?.filter((c) => c.status === "draft").length ?? 0;
  const finalCount =
    certificates?.filter((c) => c.status === "final").length ?? 0;
  const pendingCount =
    certificates?.filter((c) => c.status === "pending_manager").length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="headline-display text-[28px] leading-tight">
          Willkommen
        </h1>
        <p className="mt-2 text-[14px] text-ink-600">
          Übersicht über Ihre Zeugnisse und Zeugnisprojekte.
        </p>
      </div>

      {/* Schnellaktionen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/app/certificates/new"
          className="card p-5 transition-shadow hover:shadow-md"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-600">
            Neu
          </div>
          <div className="mt-1 text-[15px] font-medium">Zeugnis erstellen</div>
          <p className="mt-1 text-[12.5px] text-ink-600">
            Strukturiert mit Bausteinen, Hash und QR-Code.
          </p>
        </Link>
        <Link href="/app/company" className="card p-5 transition-shadow hover:shadow-md">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Firma
          </div>
          <div className="mt-1 text-[15px] font-medium">
            {companies && companies.length > 0
              ? companies[0].name
              : "Firma anlegen"}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-600">
            Stammdaten und Logo verwalten.
          </p>
        </Link>
        <Link href="/verify" className="card p-5 transition-shadow hover:shadow-md">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Prüfen
          </div>
          <div className="mt-1 text-[15px] font-medium">Zeugnis verifizieren</div>
          <p className="mt-1 text-[12.5px] text-ink-600">
            Hochgeladenes PDF auf Echtheit prüfen.
          </p>
        </Link>
      </div>

      {/* Statistik */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-3">
        <Stat label="Entwürfe" value={draftCount} />
        <Stat label="Wartet auf Führungskraft" value={pendingCount} />
        <Stat label="Finalisierte Zeugnisse" value={finalCount} />
      </div>

      {/* Letzte Zeugnisse */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-medium tracking-tight">
            Zuletzt bearbeitet
          </h2>
          <Link
            href="/app/certificates"
            className="text-[12px] font-medium text-petrol-700 hover:underline"
          >
            Alle anzeigen →
          </Link>
        </div>

        {certificates && certificates.length > 0 ? (
          <ul className="card divide-y divide-ink-100 overflow-hidden">
            {certificates.map((c: any) => (
              <li key={c.id}>
                <Link
                  href={`/app/certificates/${c.id}`}
                  className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-ink-50/50"
                >
                  <div>
                    <div className="text-[13.5px] font-medium">
                      {c.employees?.first_name} {c.employees?.last_name}
                    </div>
                    <div className="text-[11.5px] text-ink-500">
                      {new Date(c.created_at).toLocaleDateString("de-CH")}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-10 text-center text-[13px] text-ink-500">
            Noch keine Zeugnisse erstellt.{" "}
            <Link
              href="/app/certificates/new"
              className="text-petrol-700 underline"
            >
              Jetzt starten
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-1 font-display text-[28px] font-light tabular-nums">
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Entwurf", className: "bg-ink-100 text-ink-700" },
    pending_manager: {
      label: "Wartet auf Führungskraft",
      className: "bg-amber-50 text-amber-800",
    },
    manager_submitted: {
      label: "Bewertung erhalten",
      className: "bg-petrol-50 text-petrol-700",
    },
    final: { label: "Final", className: "bg-petrol-700 text-white" },
  };
  const c = config[status] ?? { label: status, className: "bg-ink-100 text-ink-700" };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}
