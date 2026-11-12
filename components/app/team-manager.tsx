"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AccessRole = "hr_leitung" | "hr" | "lesen";
type TeamRole = "admin" | AccessRole;

const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Admin",
  hr_leitung: "HR-Leitung",
  hr: "HR",
  lesen: "Lesen",
};

const ROLE_HINT: Record<TeamRole, string> = {
  admin: "verwaltet Team, Firmen und Vorlagen; sieht alle Firmen",
  hr_leitung: "erstellt, versiegelt und widerruft Zeugnisse",
  hr: "erstellt und bearbeitet Zeugnisse, versiegelt nicht",
  lesen: "sieht Zeugnisse und lädt sie herunter",
};

const STATE_LABEL: Record<string, string> = {
  offen: "offen",
  angenommen: "angenommen",
  zurueckgezogen: "zurückgezogen",
  abgelaufen: "abgelaufen",
};

export interface TeamCompany {
  id: string;
  name: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string | null;
  orgRole: "admin" | "mitglied";
  active: boolean;
  isSelf: boolean;
  access: Record<string, AccessRole>;
}

export interface TeamInvitation {
  id: string;
  email: string;
  roleLabel: string;
  companyNames: string[];
  state: string;
  expiresAt: string;
}

interface Props {
  organization: { id: string; name: string; inviteDomainOnly: boolean };
  companies: TeamCompany[];
  members: TeamMember[];
  invitations: TeamInvitation[];
}

const input =
  "w-full rounded-md border border-ink-200 px-3 py-2 text-[14px] outline-none transition-colors focus:border-petrol-600";
const select =
  "rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-petrol-600 disabled:bg-ink-50 disabled:text-ink-400";

async function send(url: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Das hat nicht geklappt.");
  return data;
}

export function TeamManager({ organization, companies, members, invitations }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [orgName, setOrgName] = useState(organization.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("hr");
  const [chosen, setChosen] = useState<string[]>(companies.length === 1 ? [companies[0].id] : []);
  const [fallbackLink, setFallbackLink] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  const updateOrg = (patch: Record<string, unknown>) =>
    run(async () => {
      await send("/api/team/organization", "PATCH", { organizationId: organization.id, ...patch });
      setNotice("Gespeichert.");
    });

  const updateMember = (userId: string, patch: Record<string, unknown>) =>
    run(async () => {
      await send(`/api/team/members/${userId}`, "PATCH", { organizationId: organization.id, ...patch });
    });

  const invite = () =>
    run(async () => {
      setFallbackLink("");
      const data = await send("/api/team/invitations", "POST", {
        organizationId: organization.id,
        email,
        role,
        companyIds: role === "admin" ? [] : chosen,
      });
      if (data.email_sent) {
        setNotice(`Einladung an ${email} verschickt.`);
      } else {
        setNotice(`Die Mail an ${email} ging nicht raus. Schicken Sie den Link selbst:`);
        setFallbackLink(data.invite_url);
      }
      setEmail("");
    });

  const withdraw = (id: string) => run(() => send(`/api/team/invitations/${id}`, "DELETE"));

  return (
    <div className="space-y-8">
      {(error || notice) && (
        <div
          className={
            error
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
              : "rounded-md border border-petrol-200 bg-petrol-50/60 px-3 py-2 text-[12.5px] text-ink-700"
          }
        >
          {error || notice}
          {!error && fallbackLink && (
            <div className="mt-2 break-all font-mono text-[12px] text-ink-800">{fallbackLink}</div>
          )}
        </div>
      )}

      {/* Organisation */}
      <section className="card border-ink-100 p-6">
        <h2 className="mb-1 text-[15px] font-medium tracking-tight">Organisation</h2>
        <p className="mb-4 text-[12.5px] text-ink-500">
          Die Organisation ist Ihr Kundenkonto. Alle Firmen und Personen darunter gehören dazu.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className={input} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          <button
            className="btn-secondary py-2 text-[12px] disabled:opacity-50"
            disabled={busy || orgName.trim() === organization.name}
            onClick={() => updateOrg({ name: orgName })}
          >
            Namen speichern
          </button>
        </div>
        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={organization.inviteDomainOnly}
            disabled={busy}
            onChange={(e) => updateOrg({ inviteDomainOnly: e.target.checked })}
          />
          <span>
            Nur Adressen mit bestätigter Firmendomain einladen.
            <span className="block text-[12px] text-ink-500">
              Die Domain bestätigen Sie unter «Firma». Gmail- und ähnliche Adressen sind dann ausgeschlossen.
            </span>
          </span>
        </label>
      </section>

      {/* Einladen */}
      <section className="card border-ink-100 p-6">
        <h2 className="mb-1 text-[15px] font-medium tracking-tight">Person einladen</h2>
        <p className="mb-4 text-[12.5px] text-ink-500">
          Die Person bekommt eine Mail mit einem Link. Sie meldet sich mit einem Code an, ein Passwort braucht es nicht.
          Der Link gilt 14 Tage und nur für diese Adresse.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <input
            className={input}
            type="email"
            placeholder="vorname.name@firma.ch"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className={`${select} py-2 text-[14px]`} value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {(["admin", "hr_leitung", "hr", "lesen"] as TeamRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[12px] text-ink-500">
          {ROLE_LABEL[role]}: {ROLE_HINT[role]}.
        </p>
        {role !== "admin" && (
          <div className="mt-4">
            <div className="mb-2 text-[12.5px] font-medium text-ink-700">Für diese Firmen</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-[13px] text-ink-700">
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(e) =>
                      setChosen((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          className="btn-primary mt-5 py-2 text-[12px] disabled:opacity-50"
          disabled={busy || !email || (role !== "admin" && chosen.length === 0)}
          onClick={invite}
        >
          Einladung schicken
        </button>
      </section>

      {/* Mitglieder */}
      <section className="card border-ink-100 p-6">
        <h2 className="mb-4 text-[15px] font-medium tracking-tight">Personen ({members.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-[11.5px] uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Organisation</th>
                {companies.map((c) => (
                  <th key={c.id} className="py-2 pr-4 font-medium normal-case tracking-normal">
                    {c.name}
                  </th>
                ))}
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className={`border-b border-ink-50 align-middle ${m.active ? "" : "text-ink-400"}`}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-ink-800">{m.name || m.email}</div>
                    {m.name && <div className="text-[11.5px] text-ink-500">{m.email}</div>}
                    {!m.active && <div className="text-[11.5px] text-amber-700">deaktiviert</div>}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      className={select}
                      value={m.orgRole}
                      disabled={busy || !m.active}
                      onChange={(e) => updateMember(m.userId, { orgRole: e.target.value })}
                    >
                      <option value="admin">Admin</option>
                      <option value="mitglied">Mitglied</option>
                    </select>
                  </td>
                  {companies.map((c) => (
                    <td key={c.id} className="py-3 pr-4">
                      {m.orgRole === "admin" ? (
                        <span className="text-ink-500">alles</span>
                      ) : (
                        <select
                          className={select}
                          value={m.access[c.id] ?? ""}
                          disabled={busy || !m.active}
                          onChange={(e) =>
                            updateMember(m.userId, { access: { [c.id]: e.target.value === "" ? null : e.target.value } })
                          }
                        >
                          <option value="">kein Zugriff</option>
                          <option value="hr_leitung">HR-Leitung</option>
                          <option value="hr">HR</option>
                          <option value="lesen">Lesen</option>
                        </select>
                      )}
                    </td>
                  ))}
                  <td className="py-3 text-right">
                    <button
                      className="text-[12px] text-ink-500 hover:text-red-700 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => {
                        if (
                          m.active &&
                          !window.confirm(
                            `${m.name || m.email} deaktivieren? Die Person verliert sofort jeden Zugriff. Versiegelte Zeugnisse bleiben gültig.`,
                          )
                        )
                          return;
                        updateMember(m.userId, { active: !m.active });
                      }}
                    >
                      {m.active ? (m.isSelf ? "mich deaktivieren" : "deaktivieren") : "reaktivieren"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Einladungen */}
      {invitations.length > 0 && (
        <section className="card border-ink-100 p-6">
          <h2 className="mb-4 text-[15px] font-medium tracking-tight">Einladungen</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-white px-3 py-2 text-[12.5px]"
              >
                <div>
                  <span className="font-medium text-ink-800">{inv.email}</span>
                  <span className="text-ink-500">
                    {" "}
                    · {inv.roleLabel}
                    {inv.companyNames.length > 0 ? ` · ${inv.companyNames.join(", ")}` : ""} · {STATE_LABEL[inv.state]}
                    {inv.state === "offen"
                      ? ` bis ${new Date(inv.expiresAt).toLocaleDateString("de-CH")}`
                      : ""}
                  </span>
                </div>
                {inv.state === "offen" && (
                  <button
                    className="text-[11px] text-ink-500 hover:text-red-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => withdraw(inv.id)}
                  >
                    zurückziehen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
