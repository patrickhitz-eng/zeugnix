import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wer bekommt die Mail «Beurteilung erhalten»?
 *
 * 1. Die Person, die das Zeugnis angelegt hat, solange sie es noch bearbeiten
 *    darf. Wer ausgetreten ist (deaktiviert) oder keinen Zugriff mehr auf die
 *    Firma hat, bekommt nichts: sie käme über den Link ohnehin nicht weiter.
 * 2. Sonst alle, die in der Firma versiegeln dürfen, ohne Admins (in der Regel
 *    die HR-Leitung, dazu Personen mit diesem Feinrecht).
 * 3. Gibt es die nicht, die Admins der Organisation.
 *
 * Die Rechte rechnet allein die Datenbank (zeugnio_permissions_for, 035). Die
 * Funktion ist nur für service_role freigegeben; darum braucht es hier den
 * Service-Client.
 */
export interface MailRecipient {
  userId: string;
  email: string;
  fullName: string | null;
}

const MAX_RECIPIENTS = 10;

async function permissionsOf(
  service: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<string[]> {
  const { data, error } = await service.rpc("zeugnio_permissions_for", {
    p_company_id: companyId,
    p_user_id: userId,
  });
  if (error) throw new Error(`Rechteprüfung fehlgeschlagen: ${error.message}`);
  return Array.isArray(data) ? (data as string[]) : [];
}

async function profilesOf(service: SupabaseClient, userIds: string[]): Promise<MailRecipient[]> {
  if (userIds.length === 0) return [];
  const { data } = await service.from("profiles").select("id, email, full_name").in("id", userIds);
  return (data ?? [])
    .filter((p: { email?: string | null }) => !!p.email)
    .map((p: { id: string; email: string; full_name: string | null }) => ({
      userId: p.id,
      email: p.email,
      fullName: p.full_name ?? null,
    }));
}

export async function evaluationMailRecipients(
  service: SupabaseClient,
  companyId: string | null | undefined,
  creatorUserId: string | null | undefined,
): Promise<MailRecipient[]> {
  if (!companyId) return [];

  if (creatorUserId && (await permissionsOf(service, companyId, creatorUserId)).includes("edit")) {
    return profilesOf(service, [creatorUserId]);
  }

  // Kandidaten: alle mit Zugang zur Firma und alle Admins ihrer Organisation.
  const { data: company } = await service
    .from("companies")
    .select("organization_id")
    .eq("id", companyId)
    .maybeSingle();
  const [{ data: members }, { data: admins }] = await Promise.all([
    service.from("company_members").select("user_id").eq("company_id", companyId),
    company?.organization_id
      ? service
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", company.organization_id)
          .eq("role", "admin")
          .is("deactivated_at", null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const candidates = Array.from(
    new Set([...(members ?? []), ...(admins ?? [])].map((r: { user_id: string }) => r.user_id)),
  );
  const sealers: string[] = [];
  const orgAdmins: string[] = [];
  for (const userId of candidates) {
    const perms = await permissionsOf(service, companyId, userId);
    if (perms.includes("admin")) orgAdmins.push(userId);
    else if (perms.includes("seal")) sealers.push(userId);
  }

  const chosen = (sealers.length > 0 ? sealers : orgAdmins).slice(0, MAX_RECIPIENTS);
  return profilesOf(service, chosen);
}
