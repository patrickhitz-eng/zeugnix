"use client";

import { useState } from "react";

const CATEGORIES_BASE = [
  { key: "fachliche_leistung", label: "Fachliche Leistung", help: "Fachkenntnisse, Qualifikation, Kompetenz im Aufgabengebiet" },
  { key: "arbeitsweise", label: "Arbeitsweise", help: "Sorgfalt, Selbständigkeit, Pflichtbewusstsein, Termintreue" },
  { key: "arbeitsqualitaet", label: "Arbeitsqualität", help: "Genauigkeit, Verlässlichkeit der Resultate" },
  { key: "zielerreichung", label: "Zielerreichung", help: "Erreichen der vereinbarten Ziele" },
  { key: "verhalten", label: "Verhalten", help: "Gegenüber Vorgesetzten, Mitarbeitenden und Dritten" },
];

const MANAGER_EXTRA = [
  { key: "fuehrungsverhalten", label: "Führungsverhalten", help: "Vorbildfunktion, Mitarbeiterführung, Teamentwicklung" },
];

const RATINGS = [
  { value: "sehr_gut", label: "Sehr gut" },
  { value: "gut", label: "Gut" },
  { value: "genuegend", label: "Genügend" },
  { value: "ungenuegend", label: "Ungenügend" },
];

interface Props {
  certificateId: string;
  isManager: boolean;
  // Genau eines von beiden muss gesetzt sein:
  token?: string; // Manager-Einladung über E-Mail-Link
  selfMode?: boolean; // Eingeloggter HR/Inhaber beurteilt selbst
}

export function ManagerEvaluationForm({
  token,
  certificateId,
  isManager,
  selfMode,
}: Props) {
  const categories = isManager ? [...CATEGORIES_BASE, ...MANAGER_EXTRA] : CATEGORIES_BASE;

  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    // Validierung: alle Pflicht-Kategorien müssen bewertet sein
    const missing = categories.filter((c) => !ratings[c.key]);
    if (missing.length > 0) {
      setError(`Bitte alle Kategorien bewerten (${missing.length} fehlen)`);
      setSubmitting(false);
      return;
    }

    const evaluations = categories.map((c) => ({
      category: c.key,
      rating: ratings[c.key],
      free_text: freeTexts[c.key] ?? null,
    }));

    let res: Response;
    if (selfMode) {
      // Eingeloggter User beurteilt direkt
      res = await fetch(`/api/certificates/${certificateId}/evaluate-self`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations }),
      });
    } else {
      // Manager über Token-Link
      res = await fetch("/api/evaluations/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, evaluations }),
      });
    }

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Fehler beim Absenden");
      setSubmitting(false);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="card p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-petrol-100">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-petrol-700"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="mt-4 text-[16px] font-medium">Beurteilung gespeichert</h2>
        <p className="mt-2 text-[13.5px] text-ink-600">
          {selfMode
            ? "Sie können jetzt den Zeugnistext generieren."
            : "Vielen Dank. Der Arbeitgeber kann nun den Zeugnistext generieren. Sie können dieses Fenster schliessen."}
        </p>
        {selfMode && (
          <a
            href={`/app/certificates/${certificateId}`}
            className="btn-primary mt-6 inline-flex"
          >
            Zurück zum Zeugnis
          </a>
        )}
      </div>
    );
  }

  const progress = Math.round(
    (Object.keys(ratings).length / categories.length) * 100,
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Fortschritt */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">Fortschritt</span>
          <span className="text-ink-500">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-petrol-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {categories.map((cat) => (
        <div key={cat.key} className="card p-5">
          <h3 className="text-[14px] font-medium tracking-tight">{cat.label}</h3>
          <p className="mt-1 text-[12px] text-ink-500">{cat.help}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() =>
                  setRatings((prev) => ({ ...prev, [cat.key]: r.value }))
                }
                className={`rounded-md border px-3 py-2.5 text-[12.5px] font-medium transition-colors ${
                  ratings[cat.key] === r.value
                    ? "border-petrol-600 bg-petrol-50 text-petrol-800"
                    : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-petrol-700 hover:underline">
              Optionale Anmerkung
            </summary>
            <textarea
              value={freeTexts[cat.key] ?? ""}
              onChange={(e) =>
                setFreeTexts((prev) => ({ ...prev, [cat.key]: e.target.value }))
              }
              rows={2}
              placeholder="z.B. besonders erwähnenswerte Projekte oder Leistungen"
              className="mt-2 w-full rounded-md border border-ink-200 px-3 py-2 text-[13px]"
            />
          </details>
        </div>
      ))}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 border-t border-ink-200 bg-white px-6 py-4">
        <button
          type="submit"
          disabled={submitting || progress < 100}
          className="btn-primary w-full disabled:opacity-50"
        >
          {submitting ? "Wird gesendet…" : "Beurteilung absenden"}
        </button>
      </div>
    </form>
  );
}
