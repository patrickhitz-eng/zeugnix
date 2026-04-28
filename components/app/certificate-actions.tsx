"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  certificate: any;
  evaluationCount: number;
  invitationCount: number;
}

export function CertificateActions({
  certificate,
  evaluationCount,
  invitationCount,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [lastInviteResult, setLastInviteResult] = useState<{
    emailSent: boolean;
    emailError?: string;
    inviteUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function inviteManager() {
    setBusy(true);
    setError("");
    setLastInviteResult(null);
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manager_email: inviteEmail,
          manager_name: inviteName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung fehlgeschlagen");
      }
      setLastInviteResult({
        emailSent: !!data.email_sent,
        emailError: data.email_error,
        inviteUrl: data.invite_url,
      });
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteUrl() {
    if (!lastInviteResult) return;
    try {
      await navigator.clipboard.writeText(lastInviteResult.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }

  async function generateText() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/generate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generierung fehlgeschlagen");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (
      !confirm(
        "Zeugnis finalisieren? Danach kann der Inhalt nicht mehr geändert werden und der Hash wird erzeugt.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/finalize`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Finalisierung fehlgeschlagen");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-4 text-[14px] font-medium tracking-tight">Aktionen</h2>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Schritt 1: Beurteilung erfassen – selbst oder per Einladung */}
        <ActionRow
          step="1"
          title="Beurteilung der Führungskraft"
          desc={
            evaluationCount > 0
              ? `${evaluationCount} Kategorien beurteilt`
              : invitationCount > 0
                ? `${invitationCount} Einladung(en) verschickt – Antwort ausstehend`
                : "Bewertung in 5 Kategorien (Selbst oder per E-Mail-Einladung)"
          }
          done={evaluationCount >= 5}
        >
          {!showInvite && evaluationCount === 0 && (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
              <a
                href={`/app/certificates/${certificate.id}/evaluate`}
                className="btn-primary py-2 text-[12px] text-center"
              >
                Selbst beurteilen
              </a>
              <button
                onClick={() => setShowInvite(true)}
                className="btn-secondary py-2 text-[12px]"
              >
                Per E-Mail einladen
              </button>
            </div>
          )}
          {!showInvite && evaluationCount > 0 && (
            <a
              href={`/app/certificates/${certificate.id}/evaluate`}
              className="btn-secondary py-2 text-[12px]"
            >
              Beurteilung anpassen
            </a>
          )}
        </ActionRow>

        {/* Inline-Formular für Einladung */}
        {showInvite && (
          <div className="rounded-md border border-petrol-200 bg-petrol-50/30 p-4">
            <div className="text-[12px] font-medium text-ink-800">
              Einladung an Führungskraft
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-700">
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="manager@firma.ch"
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-700">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Frau Muster"
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={inviteManager}
                disabled={busy || !inviteEmail}
                className="btn-primary py-2 text-[12px] disabled:opacity-50"
              >
                {busy ? "Wird gesendet…" : "Einladung senden"}
              </button>
              <button
                onClick={() => {
                  setShowInvite(false);
                  setInviteEmail("");
                  setInviteName("");
                }}
                className="text-[12px] text-ink-500 hover:text-ink-700"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Erfolgsmeldung nach Einladung */}
        {lastInviteResult && (
          <div
            className={`rounded-md border p-4 ${
              lastInviteResult.emailSent
                ? "border-petrol-200 bg-petrol-50/50"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  lastInviteResult.emailSent ? "bg-petrol-700" : "bg-amber-600"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  {lastInviteResult.emailSent ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </>
                  )}
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-ink-900">
                  {lastInviteResult.emailSent
                    ? "Einladung versendet"
                    : "Einladung erstellt – Mailversand nicht aktiviert"}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-600">
                  {lastInviteResult.emailSent
                    ? "Die Führungskraft erhält in wenigen Sekunden eine E-Mail mit dem Beurteilungslink."
                    : "Bitte teilen Sie den unten stehenden Link manuell mit der Führungskraft, oder konfigurieren Sie Resend in den Vercel-Umgebungsvariablen."}
                </p>
                {lastInviteResult.emailError && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Detail: {lastInviteResult.emailError}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={lastInviteResult.inviteUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-ink-700"
                  />
                  <button
                    onClick={copyInviteUrl}
                    className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-medium text-ink-700 hover:bg-ink-50"
                  >
                    {copied ? "Kopiert ✓" : "Kopieren"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Schritt 2: Zeugnis generieren */}
        <ActionRow
          step="2"
          title="Zeugnistext generieren"
          desc="Aus Beurteilungen und Bausteinen"
          done={!!certificate.generated_text}
        >
          {evaluationCount > 0 && (
            <button
              onClick={generateText}
              disabled={busy}
              className="btn-secondary py-2 text-[12px] disabled:opacity-50"
            >
              {certificate.generated_text ? "Neu generieren" : "Generieren"}
            </button>
          )}
        </ActionRow>

        {/* Schritt 3: Finalisieren */}
        <ActionRow
          step="3"
          title="Finalisieren mit Hash"
          desc="SHA-256-Hash berechnen, PDF generieren, unveränderlich speichern"
          done={certificate.status === "final"}
        >
          {certificate.generated_text && certificate.status !== "final" && (
            <button
              onClick={finalize}
              disabled={busy}
              className="btn-primary py-2 text-[12px] disabled:opacity-50"
            >
              Finalisieren
            </button>
          )}
        </ActionRow>
      </div>
    </div>
  );
}

function ActionRow({
  step,
  title,
  desc,
  done,
  children,
}: {
  step: string;
  title: string;
  desc: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-ink-100 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium ${
            done
              ? "bg-petrol-700 text-white"
              : "border border-ink-200 bg-white text-ink-600"
          }`}
        >
          {done ? "✓" : step}
        </div>
        <div>
          <div className="text-[13px] font-medium">{title}</div>
          <div className="text-[11.5px] text-ink-500">{desc}</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
