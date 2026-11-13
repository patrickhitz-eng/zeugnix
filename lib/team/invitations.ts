import { createHash, randomBytes } from "node:crypto";

/**
 * Einladungen ins Team einer Organisation (Marktstart Schritt 23, Migration 033).
 *
 * Der Token geht nur per Mail an die eingeladene Person. In der Datenbank liegt
 * sein SHA-256. Wer die Tabelle liest (Admin, Sicherung, Auszug), kann damit
 * keine Einladung annehmen. Der Token hat 256 Bit Zufall; ein geheimer
 * Schlüssel (HMAC) brächte darum keinen zusätzlichen Schutz.
 */

export const INVITATION_DAYS = 14;

export type OrgRole = "admin" | "mitglied";
export type AccessRole = "hr_leitung" | "hr" | "lesen";
/** Rolle, wie sie die Oberfläche anbietet: Admin oder eine Firmenrolle. */
export type TeamRole = "admin" | AccessRole;

export const ACCESS_ROLES: readonly AccessRole[] = ["hr_leitung", "hr", "lesen"];
export const TEAM_ROLES: readonly TeamRole[] = ["admin", "hr_leitung", "hr", "lesen"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isAccessRole(value: unknown): value is AccessRole {
  return typeof value === "string" && (ACCESS_ROLES as readonly string[]).includes(value);
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}

export interface InvitationInput {
  organizationId: string;
  email: string;
  orgRole: OrgRole;
  companyRole: AccessRole | null;
  companyIds: string[];
}

/** Prüft den Rumpf von POST /api/team/invitations. */
export function parseInvitationInput(
  body: unknown,
): { data: InvitationInput; error?: undefined } | { data?: undefined; error: string } {
  if (!body || typeof body !== "object") return { error: "Kein gültiges JSON." };
  const b = body as Record<string, unknown>;

  if (!isUuid(b.organizationId)) return { error: "Organisation fehlt." };
  const email = normalizeEmail(b.email);
  if (!email) return { error: "Bitte eine gültige E-Mail-Adresse angeben." };
  if (!isTeamRole(b.role)) return { error: "Bitte eine Rolle wählen." };

  if (b.role === "admin") {
    // Admins sehen alle Firmen der Organisation; eine Auswahl braucht es nicht.
    return {
      data: { organizationId: b.organizationId, email, orgRole: "admin", companyRole: null, companyIds: [] },
    };
  }

  const ids = Array.isArray(b.companyIds) ? b.companyIds : [];
  if (ids.length === 0) return { error: "Bitte mindestens eine Firma wählen." };
  if (!ids.every(isUuid)) return { error: "Ungültige Firmenauswahl." };

  return {
    data: {
      organizationId: b.organizationId,
      email,
      orgRole: "mitglied",
      companyRole: b.role,
      companyIds: Array.from(new Set(ids as string[])),
    },
  };
}

export type InvitationState = "offen" | "angenommen" | "zurueckgezogen" | "abgelaufen";

export function invitationState(
  inv: { accepted_at: string | null; revoked_at: string | null; expires_at: string },
  now: Date = new Date(),
): InvitationState {
  if (inv.accepted_at) return "angenommen";
  if (inv.revoked_at) return "zurueckgezogen";
  if (new Date(inv.expires_at).getTime() <= now.getTime()) return "abgelaufen";
  return "offen";
}

/**
 * Nur die eingeladene Adresse darf annehmen. Sonst könnte ein weitergeleiteter
 * Link jemand anderem Zugriff auf Personaldaten geben.
 */
export function emailMatchesInvitation(
  userEmail: string | null | undefined,
  invitationEmail: string,
): boolean {
  return normalizeEmail(userEmail) === normalizeEmail(invitationEmail);
}

/** Feinrechte pro Firma (Migration 035). seal: null = wie die Rolle. */
export interface FineRightsUpdate {
  seal?: boolean | null;
  team?: boolean;
  company?: boolean;
}

export interface MemberUpdate {
  organizationId: string;
  orgRole?: OrgRole;
  active?: boolean;
  /** Firmen-ID → Rolle, null = Zugriff entziehen. Nur für Mitglieder wirksam. */
  access?: Record<string, AccessRole | null>;
  /** Firmen-ID → Feinrechte. Nur die Admin-Person darf sie setzen. */
  rights?: Record<string, FineRightsUpdate>;
}

/** Rang der Firmenrollen: eine Einladung stuft niemanden zurück. */
export const ACCESS_ROLE_RANK: Record<AccessRole, number> = { hr_leitung: 3, hr: 2, lesen: 1 };

/** Rollen, die jemand mit «Team verwalten» (ohne Admin) vergeben darf. */
export const TEAM_MANAGER_ROLES: readonly AccessRole[] = ["hr", "lesen"];

/** Prüft den Rumpf von PATCH /api/team/members/[userId]. */
export function parseMemberUpdate(
  body: unknown,
): { data: MemberUpdate; error?: undefined } | { data?: undefined; error: string } {
  if (!body || typeof body !== "object") return { error: "Kein gültiges JSON." };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.organizationId)) return { error: "Organisation fehlt." };

  const data: MemberUpdate = { organizationId: b.organizationId };
  if (b.orgRole !== undefined) {
    if (b.orgRole !== "admin" && b.orgRole !== "mitglied") return { error: "Ungültige Rolle." };
    data.orgRole = b.orgRole;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") return { error: "Ungültiger Status." };
    data.active = b.active;
  }
  if (b.access !== undefined) {
    if (!b.access || typeof b.access !== "object" || Array.isArray(b.access)) {
      return { error: "Ungültige Firmenzugänge." };
    }
    const access: Record<string, AccessRole | null> = {};
    for (const [companyId, role] of Object.entries(b.access as Record<string, unknown>)) {
      if (!isUuid(companyId)) return { error: "Ungültige Firma." };
      if (role !== null && !isAccessRole(role)) return { error: "Ungültige Firmenrolle." };
      access[companyId] = role as AccessRole | null;
    }
    data.access = access;
  }
  if (b.rights !== undefined) {
    if (!b.rights || typeof b.rights !== "object" || Array.isArray(b.rights)) {
      return { error: "Ungültige Feinrechte." };
    }
    const rights: Record<string, FineRightsUpdate> = {};
    for (const [companyId, raw] of Object.entries(b.rights as Record<string, unknown>)) {
      if (!isUuid(companyId)) return { error: "Ungültige Firma." };
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Ungültige Feinrechte." };
      const r = raw as Record<string, unknown>;
      const out: FineRightsUpdate = {};
      if (r.seal !== undefined) {
        if (r.seal !== null && typeof r.seal !== "boolean") return { error: "Ungültiges Recht «Versiegeln»." };
        out.seal = r.seal as boolean | null;
      }
      if (r.team !== undefined) {
        if (typeof r.team !== "boolean") return { error: "Ungültiges Recht «Team verwalten»." };
        out.team = r.team;
      }
      if (r.company !== undefined) {
        if (typeof r.company !== "boolean") return { error: "Ungültiges Recht «Firmendaten»." };
        out.company = r.company;
      }
      if (Object.keys(out).length === 0) return { error: "Ungültige Feinrechte." };
      rights[companyId] = out;
    }
    data.rights = rights;
  }
  if (
    data.orgRole === undefined &&
    data.active === undefined &&
    data.access === undefined &&
    data.rights === undefined
  ) {
    return { error: "Nichts zu ändern." };
  }
  return { data };
}
