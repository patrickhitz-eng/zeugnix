import Link from "next/link";
import type { Metadata } from "next";
import { WorkflowSection } from "@/components/sections/workflow";
import { CompanyPackageCard } from "@/components/sections/company-package";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Für Arbeitgeber",
  description:
    "Arbeitszeugnisse strukturiert erstellen und mit Hash und QR-Code prüfbar machen – für KMU, HR-Abteilungen und Treuhänder.",
};

const kmuFeatures = [
  "Weniger Aufwand pro Zeugnis",
  "Einheitliche Beurteilungsstandards",
  "Professionelle Formulierungen",
  "Prüfbar per QR-Code",
];

const treuhandFeatures = [
  "Mehrere Firmen in einem Konto",
  "Logo und Fusszeile pro Firma",
  "Standardisierte Qualität",
  "Jedes Zeugnis prüfbar",
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-ink-200 bg-white py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Für Arbeitgeber, KMU & Treuhänder</div>
          <h1 className="headline-display mt-3 text-[40px] leading-[1.1] sm:text-[48px]">
            Arbeitszeugnisse, die weniger Aufwand machen.
            <br />
            <span className="font-display italic text-petrol-700">
              Strukturiert erstellt, automatisch abgesichert.
            </span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
            Strukturierte Erstellung mit Bausteinen, Führungskräfte-Einbindung
            über Magic Link und automatische Hash-Absicherung – für KMU,
            HR-Abteilungen und Treuhänder, auch mit mehreren Firmen in einem
            Konto.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={siteConfig.signup.cta.href} className="btn-primary">
              {siteConfig.signup.cta.label}
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
            <Link href="/how-it-works" className="btn-secondary">
              So funktioniert's
            </Link>
          </div>
        </div>
      </section>

      {/* Für wen */}
      <section className="border-b border-ink-200 bg-ink-50/50 py-24">
        <div className="container-zx">
          <div className="eyebrow">Für wen</div>
          <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
            Gebaut für Unternehmen mit HR-Verantwortung.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-200 bg-white p-7">
              <h3 className="text-[16px] font-medium tracking-tight text-ink-900">
                KMU & HR-Abteilungen
              </h3>
              <ul className="mt-5 space-y-3">
                {kmuFeatures.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[14px] text-ink-700"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-1 flex-shrink-0 text-petrol-600"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white p-7">
              <h3 className="text-[16px] font-medium tracking-tight text-ink-900">
                Treuhänder & HR-Berater
              </h3>
              <ul className="mt-5 space-y-3">
                {treuhandFeatures.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[14px] text-ink-700"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-1 flex-shrink-0 text-petrol-600"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <WorkflowSection />

      {/* Firmenpaket */}
      <section className="bg-white py-24">
        <div className="container-zx max-w-3xl">
          <CompanyPackageCard />
        </div>
      </section>
    </>
  );
}
