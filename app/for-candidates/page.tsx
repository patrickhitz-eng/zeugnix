import Link from "next/link";
import type { Metadata } from "next";
import { VerifySection } from "@/components/sections/verify";

export const metadata: Metadata = {
  title: "Für Kandidatinnen & Kandidaten",
  description:
    "Verstehen Sie, was Ihr Arbeitszeugnis wirklich aussagt – mit Echtheitsprüfung und Klartext-Analyse nach Schweizer Arbeitszeugnislogik.",
};

const benefits = [
  "Gesamturteil in Klartext",
  "Stärken und schwächere Signale",
  "Analyse der Schlussformel",
  "Hinweise auf Auffälligkeiten",
];

export default function ForCandidatesPage() {
  return (
    <>
      <section className="border-b border-ink-200 bg-white py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Für Kandidatinnen & Kandidaten</div>
          <h1 className="headline-display mt-3 text-[36px] leading-[1.12] sm:text-[48px]">
            Verstehen, was Ihr Zeugnis wirklich sagt.
          </h1>
          <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-600">
            Sie haben ein Arbeitszeugnis erhalten und möchten wissen, was es
            wirklich aussagt. Wir übersetzen Formulierungen in Klartext.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/verify?tier=analyse" className="btn-primary">
              Zeugnis analysieren
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
              Nur Echtheit prüfen
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200 bg-canvas py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Was Sie bekommen</div>
          <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
            Klartext statt Wohlwollens-Floskeln.
          </h2>

          <ul className="mt-8 space-y-3">
            {benefits.map((item) => (
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

      <section className="bg-white py-16">
        <div className="container-zx max-w-3xl">
          <p className="text-[14.5px] leading-relaxed text-ink-600">
            Eine Übersicht über alle Preise für Echtheitsprüfung und Analyse
            finden Sie auf unserer Preisseite.{" "}
            <Link
              href="/pricing"
              className="font-medium text-petrol-700 underline underline-offset-2 hover:text-petrol-600"
            >
              Alle Preise ansehen
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
