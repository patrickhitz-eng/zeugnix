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

import { roleAllows, type CompanyPermission, type CompanyRole } from "../lib/auth/ownership";
import {
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

// Die Tabelle aus Migration 033, Zeile für Zeile.
const expected: Record<CompanyPermission, Record<CompanyRole, boolean>> = {
  read: { admin: true, hr_leitung: true, hr: true, lesen: true },
  edit: { admin: true, hr_leitung: true, hr: true, lesen: false },
  seal: { admin: true, hr_leitung: true, hr: false, lesen: false },
  admin: { admin: true, hr_leitung: false, hr: false, lesen: false },
};

console.log("Rechte pro Rolle");
for (const [perm, row] of Object.entries(expected) as [CompanyPermission, Record<CompanyRole, boolean>][]) {
  for (const [role, allowed] of Object.entries(row) as [CompanyRole, boolean][]) {
    check(`${role} ${allowed ? "darf" : "darf nicht"} ${perm}`, () => assert.equal(roleAllows(role, perm), allowed));
  }
}
check("ohne Rolle: nichts", () => {
  for (const perm of ["read", "edit", "seal", "admin"] as CompanyPermission[]) assert.equal(roleAllows(null, perm), false);
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

console.log(`\n${passed} Prüfungen bestanden.`);
