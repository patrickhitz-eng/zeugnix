import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { loadCompanyOverview } from "@/lib/company/overview";
import { CompanyList } from "@/components/app/company-list";
import { NewCompanyButton, NewCompanyForm } from "@/components/app/new-company";

export const metadata = { title: "Firmen" };

/**
 * Firmenübersicht. Früher standen hier alle Firmen mit dem ganzen Formular
 * untereinander (bei fünf Marken rund 45 Karten). Jetzt: eine Liste, und jede
 * Firma hat ihre eigene Seite (/app/company/[id]).
 *
 * - keine Firma: Formular für die erste Firma (oder Hinweis für Mitglieder)
 * - genau eine Firma: direkt deren Seite, eine Liste mit einer Zeile hilft niemandem
 * - mehrere: Liste, alphabetisch, bei mehreren Organisationen gruppiert
 */
export default async function CompanyPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const overview = await loadCompanyOverview(supabase, user.id);
  const all = overview.groups.flatMap((g) => g.companies);

  if (all.length === 1) redirect(`/app/company/${all[0]!.id}`);

  if (all.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="headline-display text-[28px] leading-tight">Firma</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-600">
            Stammdaten, Logo und unterzeichnende Personen erscheinen im Briefkopf und
            Unterschriftsblock der Arbeitszeugnisse.
          </p>
        </div>
        {overview.canCreate ? (
          <div className="card max-w-xl p-6">
            <h2 className="mb-1 text-[16px] font-medium tracking-tight">Erste Firma anlegen</h2>
            <p className="mb-5 text-[12.5px] text-ink-500">
              Name und Adresse genügen. Logo, Unterzeichnende und Vorlage ergänzen Sie danach.
            </p>
            <NewCompanyForm existingNames={[]} />
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-600">
            Ihnen ist noch keine Firma freigegeben. Das macht der Admin Ihrer Organisation unter «Team».
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="headline-display text-[28px] leading-tight">Firmen</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-600">
            Jede Firma hat eigenes Logo, eigene Unterzeichnende und eine eigene Vorlage.
            Klicken Sie auf eine Firma, um sie zu öffnen.
          </p>
        </div>
        {overview.canCreate && <NewCompanyButton existingNames={all.map((c) => c.name)} />}
      </div>
      <CompanyList groups={overview.groups} total={overview.total} />
    </div>
  );
}
