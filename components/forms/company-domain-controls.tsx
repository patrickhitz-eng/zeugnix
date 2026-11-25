"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CompanyDomain {
  domain: string;
  method: string;
  status: "pending" | "email_confirmed" | "verified" | "failed" | string;
  verified_at: string | null;
  dns_token?: string | null;
}

interface Props {
  companyId: string;
  initialDomains: CompanyDomain[];
  /**
   * Domain der Anmelde-Adresse, wenn sie keine Freemail-Domain ist. Wird als
   * Ein-Klick-Erfassung angeboten.
   */
  suggestedDomain?: string | null;
  /** Anmelde-Adresse ist privat (Gmail, Bluewin …). */
  loginIsFreeMail?: boolean;
}

// Spiegelt lib/company/domain.ts (dnsRecordName/dnsRecordValue). Hier lokal,
// damit die Client-Komponente kein Server-Modul zieht.
const recordName = (domain: string) => `_zeugnio.${domain}`;
const recordValue = (token: string) => `zeugnio-verification=${token}`;

/**
 * Verwaltung der Aussteller-Domain(s) einer Firma.
 *
 * Seit 25.11.2026 (Sicherheitstest, Befund M2; Migration 039) zwei Stufen:
 *  - Mailadresse an der Domain: Vorstufe, sofort beim Erfassen. Die öffentliche
 *    Prüfung zeigt sie grau, nicht als «Aussteller bestätigt», denn eine
 *    Mailadresse hat jede Mitarbeiterin.
 *  - DNS-Eintrag: Die Firma setzt einen TXT-Eintrag. Das kann nur, wer die
 *    Domain verwaltet. Erst dann zeigt die Prüfung «Aussteller bestätigt».
 *
 * Aufbau nach Vorbildern aus Mobbin (Upwork, Langdock, Google Workspace):
 * Tabelle Name/Typ/Wert mit Kopier-Knöpfen, «Jetzt prüfen», und ein fertiger
 * Text für die Stelle, die das DNS verwaltet.
 */
export function CompanyDomainControls({
  companyId,
  initialDomains,
  suggestedDomain,
  loginIsFreeMail,
}: Props) {
  const router = useRouter();
  const [domains, setDomains] = useState<CompanyDomain[]>(initialDomains);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const hasVerified = domains.some((d) => d.status === "verified");
  const suggestionTaken = suggestedDomain
    ? domains.some((d) => d.domain === suggestedDomain)
    : true;

  function upsertLocal(next: CompanyDomain) {
    setDomains((prev) =>
      [...prev.filter((d) => d.domain !== next.domain), next].sort((a, b) =>
        a.domain.localeCompare(b.domain),
      ),
    );
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    await submitDomain(input);
  }

  async function submitDomain(domain: string) {
    setSubmitting(true);
    setError("");
    setNotice(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Domain konnte nicht gespeichert werden.");
        return;
      }
      upsertLocal({
        domain: data.domain,
        method: data.method ?? "email",
        status: data.status,
        verified_at: data.status === "pending" ? null : new Date().toISOString(),
        dns_token: data.dnsToken ?? null,
      });
      if (data.verified) {
        setNotice(`«${data.domain}» ist bereits per DNS bestätigt.`);
      } else if (data.emailConfirmed) {
        setNotice(
          `«${data.domain}» ist erfasst, Ihre Mailadresse passt dazu. Für «Aussteller bestätigt» fehlt noch der DNS-Eintrag unten.`,
        );
      } else {
        setNotice(
          `«${data.domain}» ist erfasst. Für «Aussteller bestätigt» fehlt noch der DNS-Eintrag unten.`,
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
    <div className={`card p-5${hasVerified ? "" : " ring-1 ring-amber-300"}`}>
      <div className="mb-1 text-[13px] font-medium tracking-tight">Aussteller-Domain</div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-500">
        Weist nach, dass Ihre Firma hinter den Zeugnissen steht. Bestätigt wird
        die Domain mit einem DNS-Eintrag. Den setzt, wer Ihre Domain verwaltet:
        Ihre IT, Ihre Webagentur oder Ihre Treuhand. Erst dann zeigt die
        öffentliche Prüfung Ihrer Zeugnisse «Aussteller bestätigt».
      </p>

      {!hasVerified && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900">
          <strong>Noch keine Domain per DNS bestätigt.</strong> Bis dahin zeigt
          die öffentliche Prüfung «Aussteller nicht bestätigt».
          {suggestedDomain && !suggestionTaken ? (
            <>
              {" "}
              Sie sind mit einer @{suggestedDomain}-Adresse angemeldet.
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => submitDomain(suggestedDomain)}
                  disabled={submitting}
                  className="btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
                >
                  {submitting ? "Wird erfasst…" : `${suggestedDomain} erfassen`}
                </button>
              </div>
            </>
          ) : loginIsFreeMail && domains.length === 0 ? (
            <> Erfassen Sie unten die Domain Ihrer Firma, zum Beispiel firma.ch.</>
          ) : null}
        </div>
      )}

      {domains.length > 0 && (
        <ul className="mb-4 space-y-3">
          {domains.map((d) => (
            <li key={d.domain} className="rounded-md border border-ink-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-[13px] text-ink-800">{d.domain}</span>
                  <StatusPill status={d.status} />
                </div>
                <button
                  type="button"
                  onClick={() => removeDomain(d.domain)}
                  className="shrink-0 text-[11px] text-ink-500 hover:text-red-700"
                >
                  Entfernen
                </button>
              </div>
              {d.status !== "verified" && d.dns_token ? (
                <DnsStep
                  companyId={companyId}
                  domain={d.domain}
                  token={d.dns_token}
                  onVerified={() => {
                    upsertLocal({
                      ...d,
                      method: "dns",
                      status: "verified",
                      verified_at: new Date().toISOString(),
                    });
                    router.refresh();
                  }}
                />
              ) : d.status !== "verified" ? (
                <div className="border-t border-ink-100 px-3 py-2 text-[12px] text-ink-600">
                  Für den DNS-Eintrag die Domain unten noch einmal erfassen,
                  dann erscheint der Prüfwert.
                </div>
              ) : null}
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
          {submitting ? "Wird erfasst…" : "Domain erfassen"}
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

/** Anleitung für den TXT-Eintrag einer Domain, mit «Jetzt prüfen». */
function DnsStep({
  companyId,
  domain,
  token,
  onVerified,
}: {
  companyId: string;
  domain: string;
  token: string;
  onVerified: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showItText, setShowItText] = useState(false);

  const name = recordName(domain);
  const value = recordValue(token);
  const itText =
    `Guten Tag\n\n` +
    `Bitte setzen Sie für die Domain ${domain} folgenden DNS-Eintrag:\n\n` +
    `Typ: TXT\nName/Host: ${name}\nWert: ${value}\nTTL: Standard\n\n` +
    `Der Eintrag bestätigt unsere Firma als Ausstellerin von Arbeitszeugnissen auf zeugnio.ch. ` +
    `Er ändert nichts an Website oder E-Mail.\n\nVielen Dank`;

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000);
    } catch {
      setResult({ tone: "error", text: "Kopieren nicht möglich. Bitte den Wert von Hand markieren und kopieren." });
    }
  }

  async function check() {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/domain/dns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ tone: "error", text: data.error ?? "Die Prüfung ist fehlgeschlagen." });
      } else if (data.verified) {
        onVerified();
      } else if (data.lookupError) {
        setResult({
          tone: "error",
          text: `Das DNS von ${domain} hat nicht geantwortet (${data.lookupError}). Bitte später nochmals prüfen.`,
        });
      } else if (data.found > 0) {
        setResult({
          tone: "info",
          text: `Unter ${name} steht ein TXT-Eintrag, aber nicht mit dem richtigen Wert. Bitte den Wert genau so übernehmen.`,
        });
      } else {
        setResult({
          tone: "info",
          text: `Unter ${name} ist noch kein TXT-Eintrag zu sehen. Neue Einträge sind oft nach wenigen Minuten da, manchmal erst nach einigen Stunden.`,
        });
      }
    } catch {
      setResult({ tone: "error", text: "Netzwerkfehler. Bitte erneut versuchen." });
    } finally {
      setChecking(false);
    }
  }

  const rows: { label: string; text: string; copyable: boolean }[] = [
    { label: "Typ", text: "TXT", copyable: false },
    { label: "Name", text: name, copyable: true },
    { label: "Wert", text: value, copyable: true },
  ];

  return (
    <div className="border-t border-ink-100 px-3 py-3">
      <div className="text-[12px] font-medium text-ink-800">DNS-Eintrag setzen</div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-600">
        Fügen Sie in den DNS-Einstellungen Ihrer Domain (z. B. bei Infomaniak,
        Hostpoint oder Ihrer Webagentur) diesen Eintrag hinzu. Manche Anbieter
        verlangen beim Namen nur <span className="font-mono">_zeugnio</span>,
        ohne die Domain dahinter.
      </p>
      <dl className="mt-3 divide-y divide-ink-100 rounded border border-ink-100 bg-ink-50/60">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-3 py-2">
            <dt className="w-12 shrink-0 text-[11px] text-ink-500">{r.label}</dt>
            <dd className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-800">{r.text}</dd>
            {r.copyable ? (
              <button
                type="button"
                onClick={() => copy(r.label, r.text)}
                className="shrink-0 rounded border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 hover:border-petrol-600"
              >
                {copied === r.label ? "Kopiert" : "Kopieren"}
              </button>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
        >
          {checking ? "Wird geprüft…" : "Jetzt prüfen"}
        </button>
        <button
          type="button"
          onClick={() => setShowItText((v) => !v)}
          aria-expanded={showItText}
          className="btn-secondary px-4 py-2 text-[13px]"
        >
          {showItText ? "Text für Ihre IT ausblenden" : "Text für Ihre IT"}
        </button>
      </div>
      {showItText && (
        <div className="mt-3 rounded border border-ink-100 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-ink-500">
              Für die Stelle, die Ihre Domain verwaltet (IT, Webagentur, Treuhand):
            </div>
            <button
              type="button"
              onClick={() => copy("it", itText)}
              className="shrink-0 rounded border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 hover:border-petrol-600"
            >
              {copied === "it" ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <textarea
            readOnly
            value={itText}
            rows={11}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full resize-none rounded border border-ink-100 bg-ink-50/60 p-2 font-mono text-[11.5px] leading-relaxed text-ink-800"
          />
        </div>
      )}
      {result && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-[12.5px] ${
            result.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {result.text}
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
        Per DNS bestätigt
      </span>
    );
  }
  if (status === "email_confirmed") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
        Mailadresse passt · DNS fehlt
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
      DNS fehlt
    </span>
  );
}
