"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  certificateId: string;
  status: string;
  archived: boolean;
}

export function CertificateManage({ certificateId, status, archived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isFinal = status === "final";
  const isRevoked = status === "revoked";

  async function revoke() {
    const reason = window.prompt(
      "Zeugnis widerrufen? Die Prüfung auf zeugnio.ch zeigt danach dauerhaft \"widerrufen\" an. Optional: Grund (nur intern sichtbar, nicht in der Prüfung).",
    );
    // Abbrechen im Prompt-Dialog liefert null → nicht widerrufen.
    if (reason === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificateId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Widerruf fehlgeschlagen");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(next: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Aktion fehlgeschlagen");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        "Zeugnis endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Löschen fehlgeschlagen");
      }
      router.push("/app/certificates");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="card border-ink-100 p-6">
      <h2 className="mb-1 text-[14px] font-medium tracking-tight">Verwaltung</h2>
      <p className="mb-4 text-[11.5px] text-ink-500">
        {isRevoked
          ? "Dieses Zeugnis wurde widerrufen. Die Prüfung auf zeugnio.ch zeigt das dauerhaft an – dieser Zustand kann nicht rückgängig gemacht werden."
          : isFinal
            ? "Finalisierte Zeugnisse bleiben als Dokument erhalten und können archiviert (ausgeblendet) oder widerrufen werden."
            : "Entwürfe können archiviert oder endgültig gelöscht werden."}
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {archived ? (
          <button
            onClick={() => setArchived(false)}
            disabled={busy}
            className="btn-secondary py-2 text-[12px] disabled:opacity-50"
          >
            Wiederherstellen
          </button>
        ) : (
          <button
            onClick={() => setArchived(true)}
            disabled={busy}
            className="btn-secondary py-2 text-[12px] disabled:opacity-50"
          >
            Archivieren
          </button>
        )}

        {!isFinal && !isRevoked && (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-red-200 bg-white px-4 py-2 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Löschen
          </button>
        )}

        {isFinal && (
          <button
            onClick={revoke}
            disabled={busy}
            className="rounded-md border border-red-200 bg-white px-4 py-2 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Zeugnis widerrufen
          </button>
        )}
      </div>
    </div>
  );
}
