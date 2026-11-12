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
 * read   ansehen, PDF und Word laden
 * edit   Mitarbeitende und Zeugnisse anlegen und bearbeiten, Vorgesetzte einladen
 * seal   finalisieren (versiegeln) und widerrufen
 * admin  Firmendaten, Logo, Domain, Benutzer und Rollen
 */
export type CompanyPermission = "read" | "edit" | "seal" | "admin";

const ALLOWED: Record<CompanyPermission, readonly CompanyRole[]> = {
  read: ["admin", "hr_leitung", "hr", "lesen"],
  edit: ["admin", "hr_leitung", "hr"],
  seal: ["admin", "hr_leitung"],
  admin: ["admin"],
};

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
  return roleAllows(await getCompanyRole(supabase, companyId), permission);
}

/** Fehlermeldung für ein 403, passend zum fehlenden Recht. */
export function permissionDeniedMessage(permission: CompanyPermission): string {
  switch (permission) {
    case "seal":
      return "Versiegeln und Widerrufen darf nur die HR-Leitung oder ein Admin.";
    case "edit":
      return "Mit der Rolle «Lesen» lässt sich nichts ändern.";
    case "admin":
      return "Das darf nur ein Admin der Organisation.";
    default:
      return "Kein Zugriff";
  }
}
