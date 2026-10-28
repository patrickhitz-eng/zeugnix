import Link from "next/link";
import { cn } from "@/lib/utils";

// Firmenpaket für prüfende Firmen (Recruiter, Personalvermittler). Die genannten
// Funktionen gibt es noch nicht – darum "in Planung" und "voraussichtlich",
// nicht "während der Beta kostenlos" (das würde ein bestehendes Angebot
// behaupten, UWG Art. 3 Abs. 1 lit. b). Genutzt auf /pricing und /for-employers.
export function CompanyPackageCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-xl border border-ink-200 bg-ink-50/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-navy-700 text-white">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h6v6H9z" />
          </svg>
        </div>
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-medium tracking-tight text-ink-900">
            Firmenpaket
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-500 ring-1 ring-inset ring-ink-300/40">
              In Planung
            </span>
            <span className="text-[12px] font-normal text-ink-500">
              voraussichtlich ab CHF 49/Monat
            </span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-600">
            Geplant für Firmen mit vielen Prüfungen: Recruiter-Zugang,
            Verifikationshistorie, zentrale Rechnungsstellung, Export.
          </div>
        </div>
      </div>
      <Link href="/contact" className="btn-secondary whitespace-nowrap py-2.5">
        Interesse melden
      </Link>
    </div>
  );
}
