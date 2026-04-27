import { cn } from "@/lib/utils";

interface AnalysisCardProps {
  className?: string;
}

const scores = [
  { label: "Fachleistung", rating: "Sehr gut", value: 95, level: "high" },
  { label: "Arbeitsweise", rating: "Gut", value: 75, level: "mid" },
  { label: "Verhalten", rating: "Sehr gut", value: 92, level: "high" },
  { label: "Schlussformulierung", rating: "Positiv", value: 80, level: "mid" },
] as const;

export function AnalysisCard({ className }: AnalysisCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-ink-200 bg-white p-4 shadow-2xl shadow-ink-900/[0.10]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-ink-100 pb-2.5">
        <span className="text-[12px] font-medium tracking-tight">
          Zeugnisanalyse
        </span>
        <span className="rounded-full bg-petrol-50 px-2 py-0.5 text-[10px] font-medium text-petrol-700">
          Gesamturteil: Gut
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {scores.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-[10.5px]">
              <span className="text-ink-600">{s.label}</span>
              <span className="font-medium text-ink-900">{s.rating}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  s.level === "high" ? "bg-petrol-600" : "bg-petrol-400",
                )}
                style={{ width: `${s.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md bg-ink-50/60 px-2.5 py-2 text-[10px] text-ink-600">
        <span className="font-medium text-ink-900">Auffälligkeiten:</span> Keine
        kritischen Hinweise · Vertrauensniveau: Hoch
      </div>
    </div>
  );
}
