"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  schlusssatzPreview,
  type SchlusssatzSubject,
} from "@/lib/phrases/schlusssaetze";

type ZeugnisTyp = "schluss" | "zwischen" | "arbeitsbestaetigung";
type Grund = "wunsch_an" | "wunsch_ag" | "einvernehmen";
type Grad = "standard" | "wertschaetzender" | "top";

interface Props {
  certificateId: string;
  zeugnisTyp: ZeugnisTyp;
  finalized: boolean;
  subject: SchlusssatzSubject;
  initial: {
    austrittsgrund: Grund | null;
    wertschaetzung: Grad | null;
    optinBedauern: boolean;
    optinReorg: boolean;
    optinVorgesetztenwechsel: boolean;
    optinInternerWechsel: boolean;
    newFunctionTitle: string | null;
    newCompanyName: string | null;
    transitionDate: string | null;
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Schlusssatz-Steuerung auf der Detailseite (vormals Schritt 1). Sitzt zwischen
 * dem Aktionen-Panel und der A4-Vorschau. Die Vorschau-Box läuft sofort live
 * (Client-Berechnung mit echtem Namen/Anrede); der volle A4-Text aktualisiert
 * sich bewusst erst über „Neu generieren" im Aktionen-Panel, damit manuelle
 * Editor-Änderungen nicht bei jeder Auswahl überschrieben werden.
 */
export function SchlusssatzControls({
  certificateId,
  zeugnisTyp,
  finalized,
  subject,
  initial,
}: Props) {
  const router = useRouter();
  const [austrittsgrund, setAustrittsgrund] = useState<Grund>(
    initial.austrittsgrund ?? "wunsch_an",
  );
  const [wertschaetzung, setWertschaetzung] = useState<Grad>(
    initial.wertschaetzung ?? "standard",
  );
  const [optinBedauern, setOptinBedauern] = useState(initial.optinBedauern);
  const [optinReorg, setOptinReorg] = useState(initial.optinReorg);
  const [optinVorgesetztenwechsel, setOptinVorgesetztenwechsel] = useState(
    initial.optinVorgesetztenwechsel,
  );
  const [optinInternerWechsel, setOptinInternerWechsel] = useState(
    initial.optinInternerWechsel,
  );
  const [newFunctionTitle, setNewFunctionTitle] = useState(
    initial.newFunctionTitle ?? "",
  );
  const [newCompanyName, setNewCompanyName] = useState(
    initial.newCompanyName ?? "",
  );
  const [transitionDate, setTransitionDate] = useState(
    initial.transitionDate ?? "",
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showWechselFields = optinVorgesetztenwechsel || optinInternerWechsel;

  // Aktuelle Feldwerte als vergleichbarer Payload. Gespeichert wird nur, wenn er
  // vom zuletzt bekannten Serverstand abweicht – so löst weder der erste
  // Effekt-Lauf noch der StrictMode-Doppelmount einen überflüssigen PATCH aus.
  const payload = {
    austrittsgrund,
    wertschaetzung,
    optinBedauern,
    optinReorg,
    optinVorgesetztenwechsel,
    optinInternerWechsel,
    newFunctionTitle,
    newCompanyName,
    transitionDate,
  };
  const savedSnapshot = useRef(JSON.stringify(payload));

  const vorschau =
    zeugnisTyp === "arbeitsbestaetigung"
      ? null
      : schlusssatzPreview(
          {
            zeugnisTyp,
            austrittsgrund,
            wertschaetzung,
            optinBedauern,
            optinReorg,
            optinVorgesetztenwechsel,
            optinInternerWechsel,
          },
          subject,
        );

  // Debounced Persistenz. Änderungen an den Feldern werden gesammelt und nach
  // kurzer Pause per PATCH gespeichert.
  const body = JSON.stringify(payload);
  useEffect(() => {
    if (finalized) return;
    if (body === savedSnapshot.current) return; // nichts geändert
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/certificates/${certificateId}/schlusssatz`,
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
        // Server-State (u.a. abgeleiteter type/Statusanzeige) auffrischen.
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

  if (zeugnisTyp === "arbeitsbestaetigung") return null;

  return (
    <div className="card mt-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[14px] font-medium tracking-tight">Schlusssatz</h2>
        <SaveIndicator state={finalized ? "idle" : saveState} error={saveError} />
      </div>

      {finalized && (
        <p className="mb-4 rounded-md border border-ink-200 bg-ink-50/50 px-3 py-2 text-[12px] text-ink-500">
          Zeugnis ist finalisiert – der Schlusssatz ist eingefroren.
        </p>
      )}

      <fieldset
        disabled={finalized}
        className="space-y-4 disabled:opacity-60"
      >
        {zeugnisTyp === "schluss" && (
          <>
            <Field label="Austrittsgrund">
              <select
                className="input"
                value={austrittsgrund}
                onChange={(e) => setAustrittsgrund(e.target.value as Grund)}
              >
                <option value="wunsch_an">Wunsch der/des Mitarbeitenden</option>
                <option value="wunsch_ag">Wunsch des Arbeitgebers</option>
                <option value="einvernehmen">Gegenseitiges Einvernehmen</option>
              </select>
            </Field>
            <div className="space-y-2">
              <span className="block text-[12px] font-medium text-ink-700">
                Optionale Zusätze im Schlusssatz
              </span>
              <Check
                checked={optinBedauern}
                onChange={setOptinBedauern}
                label="Bedauern über das Ausscheiden"
              />
              <Check
                checked={optinReorg}
                onChange={setOptinReorg}
                label="Reorganisation"
              />
            </div>
          </>
        )}

        {zeugnisTyp === "zwischen" && (
          <div className="space-y-2">
            <span className="block text-[12px] font-medium text-ink-700">
              Optionale Zusätze / Anlass
            </span>
            <Check
              checked={optinReorg}
              onChange={setOptinReorg}
              label="Reorganisation"
            />
            <Check
              checked={optinVorgesetztenwechsel}
              onChange={setOptinVorgesetztenwechsel}
              label="Vorgesetztenwechsel"
            />
            <Check
              checked={optinInternerWechsel}
              onChange={setOptinInternerWechsel}
              label="Interner Wechsel"
            />
          </div>
        )}

        <Field label="Wertschätzungsgrad (Schlusssatz)">
          <select
            className="input"
            value={wertschaetzung}
            onChange={(e) => setWertschaetzung(e.target.value as Grad)}
          >
            <option value="standard">Standard</option>
            <option value="wertschaetzender">Etwas wertschätzender</option>
            <option value="top">Top-Mitarbeitende</option>
          </select>
        </Field>

        {showWechselFields && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Neue Funktion (optional)">
              <input
                className="input"
                value={newFunctionTitle}
                onChange={(e) => setNewFunctionTitle(e.target.value)}
              />
            </Field>
            <Field label="Neue Firma (optional)">
              <input
                className="input"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </Field>
            <Field label="Wechseldatum (optional)">
              <input
                type="date"
                className="input"
                value={transitionDate}
                onChange={(e) => setTransitionDate(e.target.value)}
              />
            </Field>
          </div>
        )}
      </fieldset>

      {vorschau && (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50/50 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Schlusssatz-Vorschau
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">
            {vorschau}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            Änderungen werden gespeichert. Über „Neu generieren" oben wird der
            volle Zeugnistext mit diesem Schlusssatz aktualisiert.
          </p>
        </div>
      )}

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

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
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
