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

  async function inviteManager() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_email: inviteEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Einladung fehlgeschlagen");
      }
      setShowInvite(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
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
        {/* Schritt 1: Manager einladen */}
        <ActionRow
          step="1"
          title="Führungskraft einladen"
          desc={
            invitationCount > 0
              ? `${invitationCount} Einladung(en) verschickt`
              : "E-Mail-Einladung mit Beurteilungsformular"
          }
          done={invitationCount > 0}
        >
          {!showInvite ? (
            <button
              onClick={() => setShowInvite(true)}
              className="btn-secondary py-2 text-[12px]"
            >
              {invitationCount > 0 ? "Erneut einladen" : "Einladen"}
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="manager@firma.ch"
                className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
              />
              <button
                onClick={inviteManager}
                disabled={busy || !inviteEmail}
                className="btn-primary py-2 text-[12px] disabled:opacity-50"
              >
                Senden
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="text-[12px] text-ink-500 hover:text-ink-700"
              >
                Abbrechen
              </button>
            </div>
          )}
        </ActionRow>

        {/* Schritt 2: Beurteilungen erhalten */}
        <ActionRow
          step="2"
          title="Beurteilung der Führungskraft"
          desc={`${evaluationCount} Kategorien beurteilt`}
          done={evaluationCount >= 5}
        />

        {/* Schritt 3: Zeugnis generieren */}
        <ActionRow
          step="3"
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

        {/* Schritt 4: Finalisieren */}
        <ActionRow
          step="4"
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
