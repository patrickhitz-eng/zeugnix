/**
 * Test der Rechte-Logik im Code (Marktstart Schritt 23).
 *
 *   npm run test:rollen
 *
 * Prüft die reine Logik ohne Datenbank: welche Rolle was darf, wie Einladungen
 * und Änderungen an Mitgliedern geprüft werden. Die Zeilenregeln in der
 * Datenbank prüft scripts/test-rollen.sql (npm run test:rollen-db).
 */
import assert from "node:assert/strict";

import {
  COMPANY_PERMISSIONS,
  effectivePermissions,
  roleAllows,
  type CompanyPermission,
  type CompanyRole,
} from "../lib/auth/ownership";
import {
  ACCESS_ROLE_RANK,
  TEAM_MANAGER_ROLES,
  emailMatchesInvitation,
  hashInvitationToken,
  invitationState,
  newInvitationToken,
  parseInvitationInput,
  parseMemberUpdate,
} from "../lib/team/invitations";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const ORG = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";

// Die Tabelle aus Migration 033, Zeile für Zeile, dazu die Rollen-Vorgaben
// für die Feinrechte aus 035 (ohne Abweichung).
const expected: Record<CompanyPermission, Record<CompanyRole, boolean>> = {
  read: { admin: true, hr_leitung: true, hr: true, lesen: true },
  edit: { admin: true, hr_leitung: true, hr: true, lesen: false },
  seal: { admin: true, hr_leitung: true, hr: false, lesen: false },
  team: { admin: true, hr_leitung: false, hr: false, lesen: false },
  company: { admin: true, hr_leitung: false, hr: false, lesen: false },
  admin: { admin: true, hr_leitung: false, hr: false, lesen: false },
};

console.log("Rechte pro Rolle");
for (const [perm, row] of Object.entries(expected) as [CompanyPermission, Record<CompanyRole, boolean>][]) {
  for (const [role, allowed] of Object.entries(row) as [CompanyRole, boolean][]) {
    check(`${role} ${allowed ? "darf" : "darf nicht"} ${perm}`, () => assert.equal(roleAllows(role, perm), allowed));
  }
}
check("ohne Rolle: nichts", () => {
  for (const perm of COMPANY_PERMISSIONS) assert.equal(roleAllows(null, perm), false);
});

console.log("Feinrechte (035)");
const sorted = (s: Set<CompanyPermission>) => Array.from(s).sort();
check("ohne Abweichung wie die Rolle", () => {
  for (const role of ["admin", "hr_leitung", "hr", "lesen"] as CompanyRole[]) {
    const fromRole = COMPANY_PERMISSIONS.filter((p) => roleAllows(role, p)).sort();
    assert.deepEqual(sorted(effectivePermissions(role, null)), fromRole);
  }
});
check("HR darf mit Abweichung versiegeln", () =>
  assert.ok(effectivePermissions("hr", { seal_override: true }).has("seal")));
check("HR-Leitung ohne Versiegeln", () => {
  const p = effectivePermissions("hr_leitung", { seal_override: false });
  assert.ok(!p.has("seal"));
  assert.ok(p.has("edit"));
});
check("Lesen kann nie versiegeln, auch nicht mit Abweichung", () =>
  assert.ok(!effectivePermissions("lesen", { seal_override: true }).has("seal")));
check("Team verwalten und Firmendaten zusätzlich", () => {
  const p = effectivePermissions("hr", { may_manage_team: true, may_edit_company: true });
  assert.ok(p.has("team") && p.has("company"));
  assert.ok(!p.has("admin"));
});
check("Admin hat alles, Abweichungen zählen nicht", () => {
  const p = effectivePermissions("admin", { seal_override: false });
  assert.deepEqual(sorted(p), [...COMPANY_PERMISSIONS].sort());
});
check("ohne Rolle helfen Feinrechte nichts", () =>
  assert.equal(effectivePermissions(null, { may_manage_team: true }).size, 0));
check("Team verwalten vergibt nur HR und Lesen", () =>
  assert.deepEqual([...TEAM_MANAGER_ROLES].sort(), ["hr", "lesen"]));
check("Rang: HR-Leitung > HR > Lesen", () => {
  assert.ok(ACCESS_ROLE_RANK.hr_leitung > ACCESS_ROLE_RANK.hr);
  assert.ok(ACCESS_ROLE_RANK.hr > ACCESS_ROLE_RANK.lesen);
});

console.log("Einladung prüfen");
check("Admin braucht keine Firmen", () => {
  const r = parseInvitationInput({ organizationId: ORG, email: " Chefin@Firma.CH ", role: "admin" });
  assert.equal(r.error, undefined);
  assert.equal(r.data?.email, "chefin@firma.ch");
  assert.equal(r.data?.orgRole, "admin");
  assert.deepEqual(r.data?.companyIds, []);
});
check("HR braucht mindestens eine Firma", () => {
  assert.ok(parseInvitationInput({ organizationId: ORG, email: "a@b.ch", role: "hr", companyIds: [] }).error);
});
check("HR mit Firma, doppelte IDs entfernt", () => {
  const r = parseInvitationInput({ organizationId: ORG, email: "a@b.ch", role: "hr", companyIds: [C1, C1] });
  assert.equal(r.data?.companyRole, "hr");
  assert.deepEqual(r.data?.companyIds, [C1]);
});
check("unbekannte Rolle abgelehnt", () => {
  assert.ok(parseInvitationInput({ organizationId: ORG, email: "a@b.ch", role: "superadmin", companyIds: [C1] }).error);
});
check("ungültige Adresse abgelehnt", () => {
  assert.ok(parseInvitationInput({ organizationId: ORG, email: "keine-adresse", role: "admin" }).error);
});
check("ungültige Firmen-ID abgelehnt", () => {
  assert.ok(parseInvitationInput({ organizationId: ORG, email: "a@b.ch", role: "lesen", companyIds: ["x"] }).error);
});

console.log("Token und Zustand");
check("gespeichert wird nur der Hash", () => {
  const { token, tokenHash } = newInvitationToken();
  assert.equal(tokenHash, hashInvitationToken(token));
  assert.notEqual(token, tokenHash);
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
});
check("Tokens sind verschieden", () => assert.notEqual(newInvitationToken().token, newInvitationToken().token));
const now = new Date("2026-11-12T10:00:00Z");
check("offen", () =>
  assert.equal(invitationState({ accepted_at: null, revoked_at: null, expires_at: "2026-11-20T00:00:00Z" }, now), "offen"));
check("abgelaufen", () =>
  assert.equal(invitationState({ accepted_at: null, revoked_at: null, expires_at: "2026-11-01T00:00:00Z" }, now), "abgelaufen"));
check("angenommen geht vor", () =>
  assert.equal(invitationState({ accepted_at: "2026-11-02T00:00:00Z", revoked_at: null, expires_at: "2026-11-01T00:00:00Z" }, now), "angenommen"));
check("zurückgezogen", () =>
  assert.equal(invitationState({ accepted_at: null, revoked_at: "2026-11-02T00:00:00Z", expires_at: "2026-11-20T00:00:00Z" }, now), "zurueckgezogen"));
check("nur die eingeladene Adresse", () => {
  assert.equal(emailMatchesInvitation("Anna@Firma.ch", "anna@firma.ch"), true);
  assert.equal(emailMatchesInvitation("anna@gmail.com", "anna@firma.ch"), false);
  assert.equal(emailMatchesInvitation(null, "anna@firma.ch"), false);
});

console.log("Mitglieder ändern");
check("Firmenzugang setzen und entziehen", () => {
  const r = parseMemberUpdate({ organizationId: ORG, access: { [C1]: "lesen" } });
  assert.deepEqual(r.data?.access, { [C1]: "lesen" });
  const r2 = parseMemberUpdate({ organizationId: ORG, access: { [C1]: null } });
  assert.deepEqual(r2.data?.access, { [C1]: null });
});
check("Firmenrolle 'admin' gibt es nicht", () => {
  assert.ok(parseMemberUpdate({ organizationId: ORG, access: { [C1]: "admin" } }).error);
});
check("leere Änderung abgelehnt", () => assert.ok(parseMemberUpdate({ organizationId: ORG }).error));
check("deaktivieren", () => assert.equal(parseMemberUpdate({ organizationId: ORG, active: false }).data?.active, false));
check("Feinrechte setzen", () => {
  const r = parseMemberUpdate({ organizationId: ORG, rights: { [C1]: { seal: true, team: false, company: true } } });
  assert.deepEqual(r.data?.rights, { [C1]: { seal: true, team: false, company: true } });
});
check("Versiegeln zurück auf die Rollenvorgabe (null)", () => {
  const r = parseMemberUpdate({ organizationId: ORG, rights: { [C1]: { seal: null } } });
  assert.deepEqual(r.data?.rights, { [C1]: { seal: null } });
});
check("Feinrechte: falsche Typen abgelehnt", () => {
  assert.ok(parseMemberUpdate({ organizationId: ORG, rights: { [C1]: { team: "ja" } } }).error);
  assert.ok(parseMemberUpdate({ organizationId: ORG, rights: { [C1]: {} } }).error);
  assert.ok(parseMemberUpdate({ organizationId: ORG, rights: { x: { team: true } } }).error);
});

console.log(`\n${passed} Prüfungen bestanden.`);
