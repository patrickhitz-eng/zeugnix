import { createClient } from "@/lib/db/supabase-server";
import { getCompanyPermissions } from "@/lib/auth/ownership";
import { DataManager, type DataCompany, type DataOrganization } from "@/components/app/data-manager";
import { RETENTION } from "@/lib/retention";

export const metadata = { title: "Daten" };

/**
 * Export und Löschen (Schritt 17).
 *
 * Pro Firma: ZIP-Export und Löschen einzelner Mitarbeitender für alle, die
 * versiegeln dürfen; Löschen der Firma für die Admin-Person. Darunter die
 * Organisation (nur Admin) und das eigene Konto (alle).
 *
 * Die Seite zeigt nur Knöpfe an. Ob gelöscht werden darf, entscheiden die
 * Datenbankfunktionen aus 036 noch einmal selbst.
 */
export default async function DatenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name)")
    .eq("user_id", user.id)
    .is("deactivated_at", null);

  const adminOrgIds = new Set(
    (memberships ?? []).filter((m: any) => m.role === "admin").map((m: any) => m.organization_id),
  );
  const organizations: DataOrganization[] = (memberships ?? [])
    .filter((m: any) => m.role === "admin" && m.organizations)
    .map((m: any) => {
      const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
      return { id: org.id, name: org.name };
    });

  const { data: companyRows } = await supabase
    .from("companies")
    .select("id, name, organization_id")
    .order("name");

  const companies: DataCompany[] = [];
  for (const c of companyRows ?? []) {
    const permissions = await getCompanyPermissions(supabase, c.id);
    const canSeal = permissions.has("seal");
    const isAdmin = adminOrgIds.has(c.organization_id);
    if (!canSeal && !isAdmin) continue;

    let employees: DataCompany["employees"] = [];
    if (canSeal) {
      const { data: rows } = await supabase
        .from("employees")
        .select("id, first_name, last_name, function_title, certificates(id, status)")
        .eq("company_id", c.id)
        .order("last_name");
      employees = (rows ?? []).map((e: any) => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        functionTitle: e.function_title ?? "",
        certificates: (e.certificates ?? []).length,
        issued: (e.certificates ?? []).filter((x: any) => x.status === "final" || x.status === "revoked").length,
      }));
    }

    companies.push({ id: c.id, name: c.name, canSeal, isAdmin, employees });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="headline-display text-[28px] leading-tight">Daten</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-600">
          Alle Zeugnisse einer Firma herunterladen und Daten löschen. Ausgestellte
          Zeugnisse bleiben nach dem Löschen {RETENTION.registerYears} Jahre prüfbar:
          zeugnio behält dafür nur Prüfwert, Status, Arbeitgeber und Datum, keine
          Namen und keinen Text.
        </p>
      </div>
      <DataManager
        companies={companies}
        organizations={organizations}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
