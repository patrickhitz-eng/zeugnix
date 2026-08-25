"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CompanyDomain {
  domain: string;
  method: string;
  status: "pending" | "verified" | "failed" | string;
  verified_at: string | null;
}

interface Props {
  companyId: string;
  initialDomains: CompanyDomain[];
}

/**
 * Verwaltung der Aussteller-Domain(s) einer Firma (V1).
 *
 * Verifikation läuft über die bereits per Magic-Link bestätigte E-Mail des
 * eingeloggten Users: Endet sie auf die eingegebene Firmen-Domain, wird die
 * Domain sofort als „verifiziert" markiert. Das ist ein Trust-Signal, das in der
 * öffentlichen Verifikation neben dem Zeugnis erscheint.
 */
export function CompanyDomainControls({ companyId, initialDomains }: Props) {
  const router = useRouter();
  const [domains, setDomains] = useState<CompanyDomain[]>(initialDomains);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: input }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Domain konnte nicht gespeichert werden.");
        setSubmitting(false);
        return;
      }

      // Liste aktualisieren (bestehenden Eintrag ersetzen oder anhängen).
      setDomains((prev) => {
        const others = prev.filter((d) => d.domain !== data.domain);
        return [
          ...others,
          {
            domain: data.domain,
            method: data.method ?? "email",
            status: data.status,
            verified_at: data.verified ? new Date().toISOString() : null,
          },
        ].sort((a, b) => a.domain.localeCompare(b.domain));
      });

      if (data.verified) {
        setNotice(`„${data.domain}" wurde als verifizierte Aussteller-Domain bestätigt.`);
      } else {
        setNotice(
          data.loginDomain
            ? `„${data.domain}" wurde vorgemerkt, aber noch nicht verifiziert: Ihre angemeldete E-Mail (@${data.loginDomain}) gehört nicht zu dieser Domain. Melden Sie sich mit einer @${data.domain}-Adresse an, um automatisch zu verifizieren.`
            : `„${data.domain}" wurde vorgemerkt, aber noch nicht verifiziert.`,
        );
      }
      setInput("");
      router.refresh();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDomain(domain: string) {
    setError("");
    setNotice(null);
    const res = await fetch(`/api/companies/${companyId}/domain`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Domain konnte nicht entfernt werden.");
      return;
    }
    setDomains((prev) => prev.filter((d) => d.domain !== domain));
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="mb-1 text-[13px] font-medium tracking-tight">
        Aussteller-Domain
      </div>
      <p className="mb-4 text-[12px] text-ink-500">
        Weist nach, dass Ihre Firma wirklich hinter den Zeugnissen steht. Ist Ihre
        Firmen-Domain verifiziert, erscheint sie bei der öffentlichen Prüfung als
        bestätigter Aussteller. Die Verifikation erfolgt automatisch, wenn Ihre
        angemeldete E-Mail-Adresse auf diese Domain endet.
      </p>

      {domains.length > 0 && (
        <ul className="mb-4 space-y-2">
          {domains.map((d) => (
            <li
              key={d.domain}
              className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] text-ink-800">
                  {d.domain}
                </span>
                <StatusPill status={d.status} />
              </div>
              <button
                type="button"
                onClick={() => removeDomain(d.domain)}
                className="text-[11px] text-ink-500 hover:text-red-700"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addDomain} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="firma.ch"
          className="w-full rounded-md border border-ink-200 px-3 py-2 text-[14px] outline-none transition-colors focus:border-petrol-600"
        />
        <button
          type="submit"
          disabled={submitting || !input.trim()}
          className="btn-primary shrink-0 disabled:opacity-50"
        >
          {submitting ? "Wird geprüft…" : "Domain verifizieren"}
        </button>
      </form>

      {notice && (
        <div className="mt-3 rounded-md border border-petrol-200 bg-petrol-50/60 px-3 py-2 text-[12.5px] text-ink-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-petrol-100 px-2 py-0.5 text-[10.5px] font-medium text-petrol-800">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Verifiziert
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-medium text-red-800">
        Fehlgeschlagen
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
      Ausstehend
    </span>
  );
}
