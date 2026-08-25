"use client";

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "confirmed" }
  | { kind: "declined" }
  | { kind: "error"; message: string };

/**
 * Bestätigt oder lehnt eine Unterzeichner-Freigabe ab (V2, öffentlicher
 * Token-Flow). Postet an /api/signoffs/[token]/submit.
 */
export function SignoffConfirm({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(action: "confirm" | "decline") {
    if (
      action === "decline" &&
      !confirm("Freigabe wirklich ablehnen? Der Arbeitgeber wird informiert.")
    ) {
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/signoffs/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Aktion fehlgeschlagen." });
        return;
      }
      setState({ kind: data.status === "declined" ? "declined" : "confirmed" });
    } catch {
      setState({ kind: "error", message: "Netzwerkfehler. Bitte erneut versuchen." });
    }
  }

  if (state.kind === "confirmed") {
    return (
      <div className="rounded-md border border-petrol-200 bg-petrol-50/60 p-5">
        <div className="flex items-center gap-2 text-[15px] font-medium text-petrol-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Zeugnis freigegeben
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-700">
          Vielen Dank. Ihre Freigabe wurde festgehalten und erscheint als
          Echtheitssignal auf dem Zeugnis. Sie können dieses Fenster schliessen.
        </p>
      </div>
    );
  }

  if (state.kind === "declined") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-5">
        <div className="text-[15px] font-medium text-amber-900">
          Freigabe abgelehnt
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-700">
          Sie haben die Freigabe abgelehnt. Der Arbeitgeber wird darüber
          informiert. Sie können dieses Fenster schliessen.
        </p>
      </div>
    );
  }

  return (
    <div>
      {state.kind === "error" && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {state.message}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => submit("confirm")}
          disabled={state.kind === "submitting"}
          className="btn-primary disabled:opacity-50"
        >
          {state.kind === "submitting" ? "Wird gespeichert…" : "Zeugnis freigeben"}
        </button>
        <button
          onClick={() => submit("decline")}
          disabled={state.kind === "submitting"}
          className="btn-secondary disabled:opacity-50"
        >
          Ablehnen
        </button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
        Mit „Zeugnis freigeben" bestätigen Sie, dass Sie als benannte Person die
        Ausstellung dieses Arbeitszeugnisses freigeben.
      </p>
    </div>
  );
}
