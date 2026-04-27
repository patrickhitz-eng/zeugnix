import Link from "next/link";
import { CertificateMockup } from "@/components/marketing/certificate-mockup";
import { AnalysisCard } from "@/components/marketing/analysis-card";

const trustBadges = [
  "Schweizer Arbeitszeugnis-Standard",
  "Hash-basierte Echtheitsprüfung",
  "Klartext-Zeugnisanalyse",
  "Für KMU, HR & Recruiter",
  "Kostenlos erstellen",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-white">
      {/* Subtile Hintergrund-Linien für Schweizer LegalTech-Stil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #0E1014 1px, transparent 1px)",
          backgroundSize: "80px 100%",
        }}
      />

      <div className="container-zx relative grid gap-16 py-20 lg:grid-cols-12 lg:gap-12 lg:py-28">
        <div className="lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-petrol-100 bg-petrol-50 px-3 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-petrol-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-petrol-600" />
            </span>
            <span className="text-[12px] font-medium text-petrol-700">
              Schweizer Standard · Hash-verifiziert
            </span>
          </div>

          <h1 className="headline-display mt-6 text-[44px] leading-[1.04] sm:text-[56px] lg:text-[64px]">
            Arbeitszeugnisse
            <br />
            <span className="font-display italic text-petrol-700">
              komplett neu gedacht.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-ink-600">
            Erstellen Sie Schweizer Arbeitszeugnisse kostenlos, sichern Sie
            diese mit einem kryptografischen Hash ab und machen Sie Zeugnisse
            später überprüfbar und verständlich.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app/certificates/new" className="btn-primary">
              Arbeitszeugnis kostenlos erstellen
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link href="/verify" className="btn-secondary">
              Zeugnis prüfen und analysieren
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-ink-500">
            Erstellen. Absichern. Prüfen. Verstehen.
          </p>

          {/* Trust-Badges */}
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-ink-200 pt-6">
            {trustBadges.map((badge) => (
              <li
                key={badge}
                className="flex items-center gap-1.5 text-[12.5px] text-ink-600"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="text-petrol-600"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {badge}
              </li>
            ))}
          </ul>
        </div>

        {/* Produkt-Visual */}
        <div className="relative lg:col-span-6">
          <div className="relative">
            {/* Hauptzeugnis */}
            <CertificateMockup className="lg:translate-x-4" />

            {/* Schwebende Analyse-Karte */}
            <div className="absolute -bottom-6 -left-2 hidden w-[300px] sm:block lg:-bottom-8 lg:-left-8">
              <AnalysisCard />
            </div>

            {/* Verifikations-Pill */}
            <div className="absolute -right-2 top-6 flex items-center gap-1.5 rounded-full bg-petrol-700 px-3 py-1.5 text-[11.5px] font-medium text-white shadow-lg shadow-petrol-900/15 lg:-right-6 lg:top-10">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verifiziert · SHA-256
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
