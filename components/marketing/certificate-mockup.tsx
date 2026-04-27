import { cn } from "@/lib/utils";

interface CertificateMockupProps {
  className?: string;
}

export function CertificateMockup({ className }: CertificateMockupProps) {
  return (
    <div
      className={cn(
        "relative aspect-[1/1.18] w-full overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xl shadow-ink-900/[0.08]",
        className,
      )}
    >
      {/* Briefkopf */}
      <div className="flex items-start justify-between border-b border-ink-100 p-6">
        <div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-ink-900" />
            <span className="text-[11px] font-medium tracking-tight">
              Muster AG
            </span>
          </div>
          <p className="mt-1 text-[8px] text-ink-400">
            Bahnhofstrasse 1 · 8001 Zürich
          </p>
        </div>
        <div className="text-right text-[8px] leading-tight text-ink-400">
          Zürich,
          <br />
          15. Oktober 2025
        </div>
      </div>

      {/* Titel */}
      <div className="px-6 pt-5">
        <h3 className="font-display text-[15px] font-light tracking-tight text-ink-900">
          Arbeitszeugnis
        </h3>
      </div>

      {/* Zeugnistext-Lines */}
      <div className="space-y-1.5 px-6 pt-3">
        <Line w="100%" />
        <Line w="94%" />
        <Line w="88%" />
        <Line w="96%" />
        <Line w="72%" />
      </div>

      <div className="mt-3 space-y-1.5 px-6">
        <Line w="100%" />
        <Line w="86%" />
        <Line w="90%" />
        <Line w="55%" />
      </div>

      <div className="mt-3 space-y-1.5 px-6">
        <Line w="92%" />
        <Line w="78%" />
        <Line w="64%" />
      </div>

      {/* Unterschriften */}
      <div className="mt-4 flex items-end gap-6 px-6">
        <div className="flex-1">
          <div className="h-5" />
          <div className="border-t border-ink-200" />
          <p className="mt-1 text-[7px] text-ink-400">P. Meier · CEO</p>
        </div>
        <div className="flex-1">
          <div className="h-5" />
          <div className="border-t border-ink-200" />
          <p className="mt-1 text-[7px] text-ink-400">L. Weber · HR</p>
        </div>
      </div>

      {/* Hash-Block + QR Code */}
      <div className="mx-6 mb-6 mt-4 flex items-center gap-3 rounded-md border border-ink-200 bg-ink-50/70 p-3">
        <QrPlaceholder />
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-medium uppercase tracking-wider text-petrol-700">
            SHA-256 Echtheitsnachweis
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-ink-600">
            a3f5b9c2e7d18f4a2c9e1b7d0f6c4d8e
          </div>
          <div className="mt-1 text-[8px] text-ink-400">
            zeugnix.ch/verify
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ w }: { w: string }) {
  return <div className="h-[5px] rounded-sm bg-ink-200/80" style={{ width: w }} />;
}

function QrPlaceholder() {
  // Stilisierter, statischer QR-Code aus Pixel-Pattern
  const cells = [
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
    [0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
  ];

  return (
    <div className="h-12 w-12 flex-shrink-0 rounded-sm bg-white p-0.5">
      <svg viewBox="0 0 17 17" className="h-full w-full">
        {cells.flatMap((row, y) =>
          row.map((cell, x) =>
            cell ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="#0E1014"
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
