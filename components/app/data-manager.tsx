"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DataCompany {
  id: string;
  name: string;
  canSeal: boolean;
  isAdmin: boolean;
  employees: {
    id: string;
    name: string;
    functionTitle: string;
    certificates: number;
    issued: number;
  }[];
}

export interface DataOrganization {
  id: string;
  name: string;
}

interface Props {
  companies: DataCompany[];
  organizations: DataOrganization[];
  userEmail: string;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; registered?: number }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: result.error ?? "Löschen fehlgeschlagen." };
  return { ok: true, registered: result.registered };
}

/**
 * Bestätigung durch Abtippen: Ein Löschknopf, der nach einem Klick zuschlägt,
 * ist bei «ganze Firma» zu leicht getroffen. Der Server prüft dieselbe Eingabe.
 */
function ConfirmDelete({
  label,
  expected,
  hint,
  onConfirm,
}: {
  label: string;
  expected: string;
  hint: string;
  onConfirm: (typed: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-red-700 underline">
        {label}
      </button>
    );
  }

  const matches = typed.trim().toLowerCase() === expected.trim().toLowerCase();
  return (
    <div className="mt-2 rounded-md border border-red-200 bg-red-50/60 p-4">
      <p className="text-[13px] text-red-800">{hint}</p>
      <p className="mt-2 text-[12px] text-ink-600">
        Zur Bestätigung eingeben: <span className="font-medium text-ink-900">{expected}</span>
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="mt-2 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-[13px]"
        autoFocus
      />
      {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          disabled={!matches || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const problem = await onConfirm(typed.trim());
            setBusy(false);
            if (problem) setError(problem);
          }}
          className="rounded-md bg-red-700 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {busy ? "Wird gelöscht…" : "Endgültig löschen"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
          className="text-[13px] text-ink-600 underline"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function DataManager({ companies, organizations, userEmail }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  function done(text: string) {
    setMessage(text);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {message}
        </div>
      )}

      {companies.length === 0 && (
        <p className="text-[13px] text-ink-600">
          Export und Löschen von Firmendaten sind der HR-Leitung und dem Admin vorbehalten.
        </p>
      )}

      {companies.map((company) => (
        <section key={company.id} className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-medium tracking-tight">{company.name}</h2>
            {company.canSeal && (
              <a href={`/api/companies/${company.id}/export`} className="btn-primary text-[13px]">
                Alle Daten exportieren (ZIP)
              </a>
            )}
          </div>
          {company.canSeal && (
            <p className="mt-2 text-[12px] text-ink-500">
              Enthält alle ausgestellten Zeugnisse als PDF und Word sowie Listen der
              Mitarbeitenden und Zeugnisse (CSV, öffnet in Excel).
            </p>
          )}

          {company.canSeal && company.employees.length > 0 && (
            <div className="mt-5">
              <div className="text-[13px] font-medium">Mitarbeitende</div>
              <ul className="mt-2 divide-y divide-ink-100">
                {company.employees.map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <span className="text-[13px] font-medium">{e.name}</span>
                        <span className="ml-2 text-[12px] text-ink-500">
                          {e.functionTitle} · {e.certificates} {e.certificates === 1 ? "Zeugnis" : "Zeugnisse"}
                          {e.issued > 0 ? `, davon ${e.issued} ausgestellt` : ""}
                        </span>
                      </div>
                      <ConfirmDelete
                        label="Person löschen"
                        expected={e.name}
                        hint={`Löscht ${e.name} mit allen Zeugnissen und Entwürfen. Ausgestellte Zeugnisse bleiben ohne Namen und Text prüfbar.`}
                        onConfirm={async () => {
                          const result = await post(`/api/employees/${e.id}/delete`, {});
                          if (!result.ok) return result.error ?? "Löschen fehlgeschlagen.";
                          done(`${e.name} wurde gelöscht.`);
                          return null;
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {company.isAdmin && (
            <div className="mt-6 border-t border-ink-100 pt-4">
              <ConfirmDelete
                label="Firma löschen"
                expected={company.name}
                hint="Löscht die Firma mit allen Mitarbeitenden, Zeugnissen, Entwürfen, Zugängen und dem Logo. Laden Sie vorher den Export herunter. Ausgestellte Zeugnisse bleiben ohne Namen und Text prüfbar."
                onConfirm={async (typed) => {
                  const result = await post(`/api/companies/${company.id}/delete`, { confirmName: typed });
                  if (!result.ok) return result.error ?? "Löschen fehlgeschlagen.";
                  done(`${company.name} wurde gelöscht.`);
                  return null;
                }}
              />
            </div>
          )}
        </section>
      ))}

      {organizations.map((org) => (
        <section key={org.id} className="card border-red-100 p-5">
          <h2 className="text-[16px] font-medium tracking-tight">Organisation «{org.name}»</h2>
          <p className="mt-2 text-[12px] text-ink-500">
            Bei Vertragsende: löscht alle Firmen der Organisation, alle Zugänge und
            offenen Einladungen. Exportieren Sie vorher jede Firma.
          </p>
          <div className="mt-3">
            <ConfirmDelete
              label="Organisation löschen"
              expected={org.name}
              hint="Löscht die ganze Organisation. Das lässt sich nicht rückgängig machen."
              onConfirm={async (typed) => {
                const result = await post("/api/team/organization/delete", {
                  organizationId: org.id,
                  confirmName: typed,
                });
                if (!result.ok) return result.error ?? "Löschen fehlgeschlagen.";
                done(`Die Organisation «${org.name}» wurde gelöscht.`);
                return null;
              }}
            />
          </div>
        </section>
      ))}

      <section className="card p-5">
        <h2 className="text-[16px] font-medium tracking-tight">Eigenes Konto</h2>
        <p className="mt-2 text-[12px] text-ink-500">
          Löscht Ihr Konto und Ihre Zugänge. Firmen und Zeugnisse, die Sie angelegt
          haben, bleiben bei der Firma. Sind Sie die letzte Admin-Person einer
          Organisation, machen Sie zuerst eine andere Person zum Admin oder löschen
          Sie die Organisation.
        </p>
        <div className="mt-3">
          <ConfirmDelete
            label="Konto löschen"
            expected={userEmail}
            hint="Ihr Konto wird gelöscht und Sie werden abgemeldet."
            onConfirm={async (typed) => {
              const result = await post("/api/account/delete", { confirmEmail: typed });
              if (!result.ok) return result.error ?? "Löschen fehlgeschlagen.";
              window.location.href = "/";
              return null;
            }}
          />
        </div>
      </section>
    </div>
  );
}
