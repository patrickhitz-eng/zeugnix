import { getCompanyPermissions } from "@/lib/auth/ownership";
import { resolveThemeFromCompany } from "@/lib/design/document-tokens";
import { companyNameKey } from "@/lib/loeschen/confirm";

/**
 * Daten für die Firmenübersicht (/app/company) und die Detailseite
 * (/app/company/[id]). Gelesen wird mit dem Client der angemeldeten Person,
 * RLS entscheidet also, welche Firmen sie sieht. Die Rechte pro Firma kommen
 * aus denselben Funktionen wie bisher (Migration 033/035).
 */

export interface CompanyRow {
  id: string;
  name: string;
  city: string;
  logoUrl: string | null;
  organizationId: string;
  certificates: number;
  domainVerified: boolean;
  /** Akzentfarbe der Vorlage (Hex) und Name des Stils, für den Farbpunkt. */
  accent: string;
  themeLabel: string;
  /** Darf Firmendaten, Logo und Vorlage bearbeiten (Admin oder Feinrecht). */
  editable: boolean;
  /** Admin der Organisation: Domain, Anlegen, Löschen. */
  isAdmin: boolean;
  /** Ein anderer sichtbarer Eintrag heisst bis auf Schreibweise gleich. */
  similarName: boolean;
}

export interface CompanyGroup {
  organizationId: string;
  organizationName: string;
  isAdmin: boolean;
  companies: CompanyRow[];
}

export interface CompanyOverview {
  groups: CompanyGroup[];
  total: number;
  /** Darf eine neue Firma anlegen (Admin irgendwo oder noch ohne Organisation). */
  canCreate: boolean;
  adminOrgIds: Set<string>;
}

export async function loadAdminOrgIds(supabase: any, userId: string) {
  const { data: myOrgs } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .is("deactivated_at", null);
  const adminOrgIds = new Set<string>(
    (myOrgs ?? []).filter((m: any) => m.role === "admin").map((m: any) => m.organization_id),
  );
  // Wer noch zu keiner Organisation gehört, legt mit der ersten Firma seine
  // eigene an (Trigger zeugnio_company_assign_org, 033).
  const canCreate = (myOrgs ?? []).length === 0 || adminOrgIds.size > 0;
  return { adminOrgIds, canCreate };
}

export async function loadCompanyOverview(supabase: any, userId: string): Promise<CompanyOverview> {
  const { adminOrgIds, canCreate } = await loadAdminOrgIds(supabase, userId);

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, city, postal_code, logo_url, organization_id, brand_accent, default_certificate_font_family")
    .order("name");
  const list: any[] = companies ?? [];
  const ids = list.map((c) => c.id);
  const orgIds = [...new Set(list.map((c) => c.organization_id).filter(Boolean))];

  const certCount = new Map<string, number>();
  const verified = new Set<string>();
  const orgNames = new Map<string, string>();
  if (ids.length > 0) {
    const [{ data: certs }, { data: domains }, { data: orgs }] = await Promise.all([
      supabase.from("certificates").select("company_id").in("company_id", ids),
      supabase.from("company_domains").select("company_id").in("company_id", ids).in("status", ["verified", "email_confirmed"]),
      orgIds.length > 0
        ? supabase.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] }),
    ]);
    for (const c of certs ?? []) certCount.set(c.company_id, (certCount.get(c.company_id) ?? 0) + 1);
    for (const d of domains ?? []) verified.add(d.company_id);
    for (const o of orgs ?? []) orgNames.set(o.id, o.name);
  }

  // Fast gleiche Namen (nur Buchstaben und Ziffern, ohne Schreibweise).
  const keyCount = new Map<string, number>();
  for (const c of list) {
    const key = companyNameKey(c.name ?? "");
    if (key) keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }

  const rows: CompanyRow[] = [];
  for (const c of list) {
    const isAdmin = adminOrgIds.has(c.organization_id);
    const editable = isAdmin || (await getCompanyPermissions(supabase, c.id)).has("company");
    const theme = resolveThemeFromCompany(c);
    rows.push({
      id: c.id,
      name: c.name,
      city: [c.postal_code, c.city].filter(Boolean).join(" "),
      logoUrl: c.logo_url ?? null,
      organizationId: c.organization_id,
      certificates: certCount.get(c.id) ?? 0,
      domainVerified: verified.has(c.id),
      accent: theme.colors.brandAccent,
      themeLabel: theme.label,
      editable,
      isAdmin,
      similarName: (keyCount.get(companyNameKey(c.name ?? "")) ?? 0) > 1,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "de-CH", { sensitivity: "base" }));

  const groups = new Map<string, CompanyGroup>();
  for (const row of rows) {
    const id = row.organizationId ?? "";
    if (!groups.has(id)) {
      groups.set(id, {
        organizationId: id,
        organizationName: orgNames.get(id) ?? "Organisation",
        isAdmin: adminOrgIds.has(id),
        companies: [],
      });
    }
    groups.get(id)!.companies.push(row);
  }

  return {
    groups: [...groups.values()].sort((a, b) =>
      a.organizationName.localeCompare(b.organizationName, "de-CH", { sensitivity: "base" }),
    ),
    total: rows.length,
    canCreate,
    adminOrgIds,
  };
}
