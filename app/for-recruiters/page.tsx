import Link from "next/link";
import type { Metadata } from "next";
import { VerifySection } from "@/components/sections/verify";

export const metadata: Metadata = {
  title: "Für Recruiter",
  description:
    "Eingereichte Arbeitszeugnisse schnell, standardisiert und mit Echtheitsprüfung vorprüfen.",
};

const vorteile = [
  "Schnelle Vorprüfung",
  "Standardisierte Interpretation",
  "Bessere Vergleichbarkeit",
  "Echtheitsprüfung registrierter Zeugnisse",
];

export default function Page() {
  return (
    <>
      <section className="border-b border-ink-200 bg-white py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Für Recruiter</div>
          <h1 className="headline-display mt-3 text-[40px] leading-[1.1] sm:text-[48px]">
            Zeugnisse schneller und konsistenter vorprüfen.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
            Schnellere und konsistentere Vorprüfung eingereichter Zeugnisse
            mit standardisierter Interpretation und Echtheitsprüfung.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/verify?tier=premium" className="btn-primary">
              Premium-Prüfung starten
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
              Zeugnis prüfen
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200 bg-white py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Vorteile</div>
          <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
            Was zeugnio für Ihr Recruiting-Team bringt.
          </h2>

          <ul className="mt-8 space-y-3">
            {vorteile.map((item) => (
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
      </section>

      <VerifySection />

      <section className="bg-white py-24">
        <div className="container-zx max-w-3xl">
          <p className="text-[15px] leading-relaxed text-ink-600">
            Arbeitgeber, die ihre Zeugnisse mit dem zeugnio-Arbeitgeber-Siegel
            „Verified Certificate Employer" auszeichnen, signalisieren
            Recruitern zusätzliches Vertrauen.{" "}
            <Link
              href="/for-employers"
              className="font-medium text-petrol-700 underline underline-offset-2 hover:text-petrol-800"
            >
              Mehr über das Arbeitgeber-Siegel
            </Link>
            .
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
            Details zu Umfang und Kosten der einzelnen Prüfungen finden Sie
            auf der Preisseite.{" "}
            <Link
              href="/pricing"
              className="font-medium text-petrol-700 underline underline-offset-2 hover:text-petrol-800"
            >
              Alle Preise ansehen
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
