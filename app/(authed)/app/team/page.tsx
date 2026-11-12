import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { companyRoleLabel } from "@/lib/auth/ownership";
import { invitationState, isAccessRole, type AccessRole } from "@/lib/team/invitations";
import { TeamManager, type TeamInvitation, type TeamMember } from "@/components/app/team-manager";

export const metadata = { title: "Team" };

/**
 * Team einer Organisation (Marktstart Schritt 23).
 *
 * Admins sehen alle Personen, ihre Rollen pro Firma und die Einladungen.
 * Alle anderen sehen nur ihre eigenen Rollen. Gelesen wird mit der Sitzung,
 * also unter den Zeilenregeln aus 033. Einzige Ausnahme: Name und Adresse der
 * Mitglieder stehen in profiles, und dort sieht jede Person nur sich selbst.
 * Diese zwei Felder holt der Service-Client – erst nachdem feststeht, dass
 * die angemeldete Person Admin dieser Organisation ist.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: wantedOrg } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, deactivated_at, organizations(id, name, invite_domain_only)")
    .eq("user_id", user.id)
    .is("deactivated_at", null);

  const adminOrgs = (memberships ?? [])
    .filter((m: any) => m.role === "admin" && m.organizations)
    .map((m: any) => (Array.isArray(m.organizations) ? m.organizations[0] : m.organizations));

  const header = (
    <div>
      <h1 className="headline-display text-[28px] leading-tight">Team</h1>
      <p className="mt-2 text-[14px] text-ink-600">
        Wer in welcher Firma Zeugnisse erstellt, versiegelt oder nur liest.
      </p>
    </div>
  );

  if (adminOrgs.length === 0) {
    // Kein Admin: eigene Rollen zeigen.
    const { data: own } = await supabase
      .from("company_members")
      .select("access_role, companies(name)")
      .eq("user_id", user.id);
    return (
      <div className="space-y-8">
        {header}
        <section className="card border-ink-100 p-6 text-[13.5px] text-ink-700">
          <p>Ihr Team verwaltet der Admin Ihrer Organisation.</p>
          {own && own.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {own.map((row: any, i: number) => {
                const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
                return (
                  <li key={i}>
                    {company?.name ?? "Firma"}:{" "}
                    <span className="font-medium">
                      {companyRoleLabel(row.access_role, String(row.access_role))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const org = adminOrgs.find((o: any) => o.id === wantedOrg) ?? adminOrgs[0];

  const [{ data: companies }, { data: orgMembers }, { data: invitationRows }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("organization_id", org.id).order("name"),
    supabase
      .from("organization_members")
      .select("user_id, role, deactivated_at, added_at")
      .eq("organization_id", org.id)
      .order("added_at"),
    supabase
      .from("organization_invitations")
      .select("id, email, org_role, company_role, company_ids, expires_at, accepted_at, revoked_at, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const companyList = (companies ?? []) as { id: string; name: string }[];
  const companyIds = companyList.map((c) => c.id);
  const companyName = new Map(companyList.map((c) => [c.id, c.name]));

  const { data: accessRows } = companyIds.length
    ? await supabase.from("company_members").select("company_id, user_id, access_role").in("company_id", companyIds)
    : { data: [] as any[] };

  const userIds = (orgMembers ?? []).map((m: any) => m.user_id);
  const { data: profiles } = userIds.length
    ? await createServiceClient().from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [] as any[] };
  const profileById = new Map<string, { email?: string; full_name?: string | null }>(
    (profiles ?? []).map((p: any) => [p.id, p]),
  );

  const members: TeamMember[] = (orgMembers ?? []).map((m: any) => {
    const access: Record<string, AccessRole> = {};
    for (const a of accessRows ?? []) {
      if (a.user_id === m.user_id && isAccessRole(a.access_role)) access[a.company_id] = a.access_role;
    }
    const p = profileById.get(m.user_id);
    return {
      userId: m.user_id,
      email: p?.email ?? "unbekannt",
      name: p?.full_name ?? null,
      orgRole: m.role,
      active: !m.deactivated_at,
      isSelf: m.user_id === user.id,
      access,
    };
  });

  const invitations: TeamInvitation[] = (invitationRows ?? []).map((inv: any) => ({
    id: inv.id,
    email: inv.email,
    roleLabel: inv.org_role === "admin" ? "Admin" : companyRoleLabel(inv.company_role),
    companyNames: (inv.company_ids ?? []).map((id: string) => companyName.get(id)).filter(Boolean),
    state: invitationState(inv),
    expiresAt: inv.expires_at,
  }));

  return (
    <div className="space-y-8">
      {header}
      {adminOrgs.length > 1 && (
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          {adminOrgs.map((o: any) => (
            <a
              key={o.id}
              href={`/app/team?org=${o.id}`}
              className={`rounded-full border px-3 py-1 ${o.id === org.id ? "border-petrol-600 text-petrol-700" : "border-ink-200 text-ink-600"}`}
            >
              {o.name}
            </a>
          ))}
        </div>
      )}
      {companyList.length === 0 ? (
        <section className="card border-ink-100 p-6 text-[13.5px] text-ink-700">
          Legen Sie zuerst unter «Firma» eine Firma an. Danach laden Sie hier Personen ein.
        </section>
      ) : (
        <TeamManager
          organization={{ id: org.id, name: org.name, inviteDomainOnly: !!org.invite_domain_only }}
          companies={companyList}
          members={members}
          invitations={invitations}
        />
      )}
    </div>
  );
}
