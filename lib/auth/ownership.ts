import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rollen und Rechte pro Firma (Marktstart Schritt 23, Migration 033).
 *
 * Die Rolle berechnet allein die Datenbankfunktion `zeugnio_company_role`.
 * Dieselbe Funktion steckt in den Zeilenregeln (RLS). Der Server fragt sie hier
 * per RPC ab und prüft damit ein zweites Mal, vor jeder Änderung. Die
 * Datenbank bleibt die Grenze; diese Prüfung liefert ein klares 403 statt
 * eines stillen «0 Zeilen geändert».
 *
 * Erwartet den AUTHENTIFIZIERTEN Client (createClient, nicht Service-Role):
 * die Funktion liest die handelnde Person aus der Sitzung (auth.uid()).
 */

export type CompanyRole = "admin" | "hr_leitung" | "hr" | "lesen";

/**
 * read     ansehen, PDF und Word laden
 * edit     Mitarbeitende und Zeugnisse anlegen und bearbeiten, Vorgesetzte einladen
 * seal     finalisieren (versiegeln) und widerrufen
 * team     in diese Firma einladen, dort HR und Lesen vergeben (Migration 035)
 * company  Firmendaten, Logo und Mastervorlage (Migration 035)
 * admin    alles, dazu Domain, Organisation und Feinrechte
 *
 * Die Rolle ist nur die Vorlage. Seit 035 kann die Admin-Person pro Person und
 * Firma «seal», «team» und «company» abweichend setzen. Massgeblich ist darum
 * getCompanyPermissions(), nicht roleAllows().
 */
export type CompanyPermission = "read" | "edit" | "seal" | "team" | "company" | "admin";

export const COMPANY_PERMISSIONS: readonly CompanyPermission[] = [
  "read",
  "edit",
  "seal",
  "team",
  "company",
  "admin",
];

/** Vorgaben der Rollen, ohne Feinrechte. Spiegelt zeugnio_permissions_for() in 035. */
const ALLOWED: Record<CompanyPermission, readonly CompanyRole[]> = {
  read: ["admin", "hr_leitung", "hr", "lesen"],
  edit: ["admin", "hr_leitung", "hr"],
  seal: ["admin", "hr_leitung"],
  team: ["admin"],
  company: ["admin"],
  admin: ["admin"],
};

/** Die drei Feinrechte, die die Admin-Person pro Person und Firma setzen kann. */
export type FineRight = "seal" | "team" | "company";
export const FINE_RIGHTS: readonly FineRight[] = ["seal", "team", "company"];
export const FINE_RIGHT_LABEL: Record<FineRight, string> = {
  seal: "Versiegeln und widerrufen",
  team: "Team verwalten",
  company: "Firmendaten und Vorlage",
};

/** Spalten in company_members. seal: null = wie die Rolle. */
export interface FineRightColumns {
  seal_override: boolean | null;
  may_manage_team: boolean;
  may_edit_company: boolean;
}

/**
 * Wirksame Rechte aus Rolle und Feinrechten, ohne Datenbank. Spiegelt
 * zeugnio_permissions_for() in 035; die Datenbank bleibt massgeblich.
 */
export function effectivePermissions(
  role: CompanyRole | null | undefined,
  fine?: Partial<FineRightColumns> | null,
): Set<CompanyPermission> {
  const out = new Set<CompanyPermission>();
  if (!role) return out;
  if (role === "admin") return new Set(COMPANY_PERMISSIONS);
  out.add("read");
  if (role === "hr_leitung" || role === "hr") {
    out.add("edit");
    const seal = fine?.seal_override ?? role === "hr_leitung";
    if (seal) out.add("seal");
  }
  if (fine?.may_manage_team) out.add("team");
  if (fine?.may_edit_company) out.add("company");
  return out;
}

export const COMPANY_ROLES: readonly CompanyRole[] = ["admin", "hr_leitung", "hr", "lesen"];

/** Bezeichnungen für die Oberfläche. */
export const COMPANY_ROLE_LABEL: Record<CompanyRole, string> = {
  admin: "Admin",
  hr_leitung: "HR-Leitung",
  hr: "HR",
  lesen: "Lesen",
};

export function isCompanyRole(value: unknown): value is CompanyRole {
  return typeof value === "string" && (COMPANY_ROLES as readonly string[]).includes(value);
}

/** Bezeichnung einer Firmenrolle aus der Datenbank; Unbekanntes bleibt sichtbar. */
export function companyRoleLabel(value: unknown, fallback = "Mitglied"): string {
  return isCompanyRole(value) ? COMPANY_ROLE_LABEL[value as CompanyRole] : fallback;
}

/** Reine Regel, ohne Datenbank. Spiegelt die Tabelle in Migration 033. */
export function roleAllows(role: CompanyRole | null | undefined, permission: CompanyPermission): boolean {
  if (!role) return false;
  return ALLOWED[permission].includes(role);
}

/** Rolle der angemeldeten Person in dieser Firma, oder null ohne Zugriff. */
export async function getCompanyRole(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<CompanyRole | null> {
  if (!companyId) return null;
  const { data, error } = await supabase.rpc("zeugnio_company_role", {
    p_company_id: companyId,
  });
  // Echte Fehler (Timeout, Netzwerk) nicht als «kein Zugriff» verschlucken:
  // sonst bekäme eine berechtigte Person fälschlich ein 403. Die Route liefert
  // dann 500 (wiederholbar).
  if (error) {
    throw new Error(`Rollenprüfung fehlgeschlagen: ${error.message}`);
  }
  return isCompanyRole(data) ? data : null;
}

/**
 * Wirksame Rechte der angemeldeten Person in dieser Firma, aus Rolle und
 * Feinrechten (Migration 035, Funktion zeugnio_permissions).
 */
export async function getCompanyPermissions(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<Set<CompanyPermission>> {
  if (!companyId) return new Set();
  const { data, error } = await supabase.rpc("zeugnio_permissions", {
    p_company_id: companyId,
  });
  // Wie bei getCompanyRole: ein echter Fehler ist kein «kein Zugriff».
  if (error) {
    throw new Error(`Rechteprüfung fehlgeschlagen: ${error.message}`);
  }
  const list = Array.isArray(data) ? data : [];
  return new Set(
    list.filter((p: unknown): p is CompanyPermission =>
      (COMPANY_PERMISSIONS as readonly unknown[]).includes(p),
    ),
  );
}

/**
 * Darf die angemeldete Person das in dieser Firma? `userId` dient nur als
 * Schutz gegen einen fehlenden Login; massgeblich ist die Sitzung.
 */
export async function userHasCompanyPermission(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
  userId: string | null | undefined,
  permission: CompanyPermission,
): Promise<boolean> {
  if (!companyId || !userId) return false;
  return (await getCompanyPermissions(supabase, companyId)).has(permission);
}

/** Fehlermeldung für ein 403, passend zum fehlenden Recht. */
export function permissionDeniedMessage(permission: CompanyPermission): string {
  switch (permission) {
    case "seal":
      return "Versiegeln und Widerrufen ist für Sie in dieser Firma nicht freigeschaltet.";
    case "edit":
      return "Mit der Rolle «Lesen» lässt sich nichts ändern.";
    case "team":
      return "Das Team dieser Firma verwaltet der Admin der Organisation.";
    case "company":
      return "Firmendaten und Vorlage ändert der Admin der Organisation.";
    case "admin":
      return "Das darf nur ein Admin der Organisation.";
    default:
      return "Kein Zugriff";
  }
}
