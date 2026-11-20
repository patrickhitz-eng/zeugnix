import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/lib/phrases/analyze";

/**
 * Datengetriebene Anzeige einer Zeugnis-Analyse (AnalysisResult aus
 * lib/phrases/analyze.ts). Optik angelehnt an den Marketing-Mock
 * components/marketing/analysis-card.tsx, aber mit echten Daten.
 */

type Rating = AnalysisResult["overall_rating"];
type CategoryRating = AnalysisResult["category_scores"][string];

const RATING_LABEL: Record<CategoryRating, string> = {
  sehr_gut: "Sehr gut",
  gut: "Gut",
  genuegend: "Genügend",
  ungenuegend: "Ungenügend",
  unklar: "Unklar",
};

// Balkenbreite + Farbe je Bewertung (für die Kategorie-Balken).
const RATING_BAR: Record<CategoryRating, { pct: number; tone: "high" | "mid" | "low" | "muted" }> = {
  sehr_gut: { pct: 95, tone: "high" },
  gut: { pct: 75, tone: "high" },
  genuegend: { pct: 50, tone: "mid" },
  ungenuegend: { pct: 25, tone: "low" },
  unklar: { pct: 8, tone: "muted" },
};

const CATEGORY_LABEL: Record<string, string> = {
  fachliche_leistung: "Fachleistung",
  arbeitsweise: "Arbeitsweise",
  arbeitsqualitaet: "Arbeitsqualität",
  zielerreichung: "Zielerreichung",
  verhalten: "Verhalten",
};

const CONFIDENCE_LABEL: Record<AnalysisResult["confidence_level"], string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  tief: "Tief",
};

const CLOSING_LABEL: Record<AnalysisResult["closing_formula_rating"], string> = {
  stark: "Stark – echtes Bedauern",
  neutral: "Neutral – Standard",
  schwach: "Schwach – auffällig kühl",
  nicht_erkannt: "Nicht erkannt",
};

function overallBadgeClass(rating: Rating): string {
  switch (rating) {
    case "sehr_gut":
    case "gut":
      return "bg-petrol-50 text-petrol-700";
    case "genuegend":
      return "bg-amber-50 text-amber-800";
    case "ungenuegend":
      return "bg-red-50 text-red-700";
  }
}

function barColor(tone: "high" | "mid" | "low" | "muted"): string {
  switch (tone) {
    case "high":
      return "bg-petrol-600";
    case "mid":
      return "bg-petrol-400";
    case "low":
      return "bg-amber-500";
    case "muted":
      return "bg-ink-300";
  }
}

export function VerifyAnalysisResult({ result }: { result: AnalysisResult }) {
  const categories = Object.entries(result.category_scores);

  return (
    <div className="card overflow-hidden">
      {/* Kopf */}
      <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Zeugnisanalyse
          </div>
          <div className="mt-0.5 text-[15px] font-medium text-ink-900">
            Aussagekraft des Zeugnisses
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-medium",
            overallBadgeClass(result.overall_rating),
          )}
        >
          Gesamturteil: {RATING_LABEL[result.overall_rating]}
        </span>
      </div>

      <div className="space-y-5 p-6">
        {/* Score + Konfidenz */}
        <div className="flex flex-wrap gap-3 text-[12px]">
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <span className="text-ink-500">Score </span>
            <span className="font-medium text-ink-900">
              {result.overall_score.toFixed(1)} / 6
            </span>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <span className="text-ink-500">Vertrauensniveau </span>
            <span className="font-medium text-ink-900">
              {CONFIDENCE_LABEL[result.confidence_level]}
            </span>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <span className="text-ink-500">Schlussformel </span>
            <span className="font-medium text-ink-900">
              {CLOSING_LABEL[result.closing_formula_rating]}
            </span>
          </div>
        </div>

        {/* Kategorie-Balken */}
        {categories.length > 0 && (
          <div className="space-y-2.5">
            {categories.map(([key, rating]) => {
              const bar = RATING_BAR[rating];
              return (
                <div key={key}>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-ink-600">
                      {CATEGORY_LABEL[key] ?? key}
                    </span>
                    <span className="font-medium text-ink-900">
                      {RATING_LABEL[rating]}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn("h-full rounded-full", barColor(bar.tone))}
                      style={{ width: `${bar.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stärken */}
        {result.strengths.length > 0 && (
          <div>
            <div className="text-[12px] font-medium text-ink-900">Stärken</div>
            <ul className="mt-2 space-y-1.5">
              {result.strengths.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-700"
                >
                  <span className="mt-0.5 flex-shrink-0 text-petrol-600">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Auffälligkeiten / Schwächen */}
        {result.weaknesses.length > 0 && (
          <div>
            <div className="text-[12px] font-medium text-ink-900">
              Auffälligkeiten
            </div>
            <ul className="mt-2 space-y-1.5">
              {result.weaknesses.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] leading-relaxed text-amber-900"
                >
                  <span className="mt-0.5 flex-shrink-0 text-amber-600">!</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Zusammenfassung */}
        {result.summary && (
          <div className="rounded-md bg-ink-50/70 px-4 py-3 text-[13px] leading-relaxed text-ink-700">
            {result.summary}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-ink-500">
          Die Analyse ist eine heuristische Einschätzung der Formulierungen und
          ersetzt keine rechtliche Beratung.
        </p>
      </div>
    </div>
  );
}
