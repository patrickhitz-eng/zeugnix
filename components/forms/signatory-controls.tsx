"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  certificateId: string;
  finalized: boolean;
  /** Firmenvorgabe – erscheint als Platzhalter und gilt, solange nichts gesetzt ist. */
  companyDefaults: {
    signatory1Name: string;
    signatory1Role: string;
    signatory2Name: string;
    signatory2Role: string;
  };
  /** Zeugnis-Override (leer = Firmenvorgabe verwenden). */
  initial: {
    signatory1Name: string;
    signatory1Role: string;
    signatory2Name: string;
    signatory2Role: string;
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Unterzeichnende pro Zeugnis (unter dem Schlusssatz auf der Detailseite).
 * Überschreibt die Firmenvorgabe nur für dieses Zeugnis: ist ein Name gesetzt,
 * gilt er; leer = Firmenvorgabe (als Platzhalter sichtbar). Auflösung serverseitig
 * in lib/certificate/signatories.ts. Auto-Save debounced, danach router.refresh()
 * – so übernimmt die A4-Vorschau den geänderten Unterschriftsblock.
 */
export function SignatoryControls({
  certificateId,
  finalized,
  companyDefaults,
  initial,
}: Props) {
  const router = useRouter();
  const [signatory1Name, setSignatory1Name] = useState(initial.signatory1Name);
  const [signatory1Role, setSignatory1Role] = useState(initial.signatory1Role);
  const [signatory2Name, setSignatory2Name] = useState(initial.signatory2Name);
  const [signatory2Role, setSignatory2Role] = useState(initial.signatory2Role);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const payload = {
    signatory1Name,
    signatory1Role,
    signatory2Name,
    signatory2Role,
  };
  const body = JSON.stringify(payload);
  const savedSnapshot = useRef(body);

  const hasCompanyDefaults =
    !!companyDefaults.signatory1Name || !!companyDefaults.signatory2Name;

  useEffect(() => {
    if (finalized) return;
    if (body === savedSnapshot.current) return;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/certificates/${certificateId}/signatory`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Speichern fehlgeschlagen");
        }
        savedSnapshot.current = body;
        setSaveState("saved");
        setSaveError("");
        // Vorschau (Unterschriftsblock) mit den effektiven Werten auffrischen.
        router.refresh();
      } catch (e: any) {
        setSaveState("error");
        setSaveError(e.message);
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, finalized]);

  return (
    <div className="card mt-6 p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[14px] font-medium tracking-tight">
          Unterzeichnende (nur dieses Zeugnis)
        </h2>
        <SaveIndicator state={finalized ? "idle" : saveState} error={saveError} />
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-500">
        {hasCompanyDefaults
          ? "Leer lassen = Firmenvorgabe verwenden (als Platzhalter angezeigt). Ein hier gesetzter Name überschreibt die Firma nur für dieses Zeugnis."
          : "Für die Firma sind noch keine Unterzeichnenden hinterlegt. Hier gesetzte Personen gelten für dieses Zeugnis."}
      </p>

      {finalized && (
        <p className="mb-4 rounded-md border border-ink-200 bg-ink-50/50 px-3 py-2 text-[12px] text-ink-500">
          Zeugnis ist finalisiert – die Unterzeichnenden sind eingefroren.
        </p>
      )}

      <fieldset disabled={finalized} className="space-y-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Erste Person – Name">
            <input
              className="input"
              value={signatory1Name}
              placeholder={companyDefaults.signatory1Name || "Vor- und Nachname"}
              onChange={(e) => setSignatory1Name(e.target.value)}
            />
          </Field>
          <Field label="Erste Person – Funktion">
            <input
              className="input"
              value={signatory1Role}
              placeholder={companyDefaults.signatory1Role || "z.B. Geschäftsführer"}
              onChange={(e) => setSignatory1Role(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zweite Person – Name (optional)">
            <input
              className="input"
              value={signatory2Name}
              placeholder={companyDefaults.signatory2Name || "Vor- und Nachname"}
              onChange={(e) => setSignatory2Name(e.target.value)}
            />
          </Field>
          <Field label="Zweite Person – Funktion (optional)">
            <input
              className="input"
              value={signatory2Role}
              placeholder={companyDefaults.signatory2Role || "z.B. HR-Leiterin"}
              onChange={(e) => setSignatory2Role(e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <style>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border: 1px solid rgb(228, 230, 234);
          border-radius: 6px;
          background: white;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: rgb(15, 122, 107);
          box-shadow: 0 0 0 3px rgba(15, 122, 107, 0.1);
        }
      `}</style>
    </div>
  );
}

function SaveIndicator({ state, error }: { state: SaveState; error: string }) {
  if (state === "saving")
    return <span className="text-[11px] text-ink-400">Speichert…</span>;
  if (state === "saved")
    return <span className="text-[11px] text-petrol-600">Gespeichert ✓</span>;
  if (state === "error")
    return (
      <span className="text-[11px] text-red-600" title={error}>
        Nicht gespeichert
      </span>
    );
  return null;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">
        {label}
      </span>
      {children}
    </label>
  );
}
