import Link from "next/link";
import type { Metadata } from "next";
import { SolutionSection } from "@/components/sections/solution";
import { WorkflowSection } from "@/components/sections/workflow";

export const metadata: Metadata = {
  title: "So funktioniert's",
  description:
    "Der komplette Ablauf: von der strukturierten Beurteilung über Hash-Absicherung bis zur Verifikation und Klartext-Analyse.",
};

const verifySteps = [
  {
    title: "PDF hochladen",
    body: "Ein Arbeitszeugnis als PDF hochladen. Text-PDFs werden direkt im Browser verarbeitet, maximal 15 MB Dateigrösse.",
  },
  {
    title: "Hash abgleichen",
    body: "Der Inhaltshash wird neu berechnet und mit der zeugnio-Datenbank verglichen: verifiziert, nicht verifiziert oder unbekannt.",
  },
  {
    title: "Formulierungen verstehen (optional)",
    body: "Bei Premium-Prüfung oder Zeugnisanalyse werden die Formulierungen zusätzlich nach Schweizer Arbeitszeugnislogik ausgewertet: Gesamturteil, Stärken, schwächere Signale, Schlussformel.",
  },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-ink-200 bg-white py-20 lg:py-28">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">So funktioniert's</div>
          <h1 className="headline-display mt-3 text-[36px] leading-[1.1] sm:text-[48px] lg:text-[56px]">
            Vier Schritte. Ein Zeugnis.
            <br />
            <span className="font-display italic text-petrol-700">
              Erstellen, absichern, prüfen, verstehen.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-ink-600">
            Bisher wurden Arbeitszeugnisse geschrieben, abgelegt und
            weitergeleitet. Neu werden sie strukturiert erstellt,
            kryptografisch abgesichert, später verifiziert und inhaltlich
            analysiert.
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
        </div>
      </section>

      <SolutionSection />

      <WorkflowSection />

      {/* Für Kandidatinnen, Recruiter & Prüfende */}
      <section className="border-b border-ink-200 bg-ink-50/50 py-24">
        <div className="container-zx max-w-3xl">
          <div className="eyebrow">Für Kandidatinnen, Recruiter &amp; Prüfende</div>
          <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
            Vom PDF zur verständlichen Einschätzung.
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-600">
            Wer ein Arbeitszeugnis erhält oder prüft, durchläuft einen
            eigenen, kurzen Ablauf – unabhängig davon, wie das Zeugnis
            erstellt wurde.
          </p>

          <div className="mt-12">
            <ol className="relative">
              <div
                aria-hidden="true"
                className="absolute left-[18px] top-3 h-[calc(100%-1.5rem)] w-px bg-ink-200"
              />
              {verifySteps.map((step, i) => (
                <li key={step.title} className="relative pb-7 pl-14 last:pb-0">
                  <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white font-mono text-[11px] font-medium text-petrol-700">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-1 text-[16.5px] font-medium tracking-tight text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Abschluss */}
      <section className="bg-white py-24">
        <div className="container-zx max-w-3xl">
          <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-10 text-center sm:p-14">
            <h2 className="headline-display text-[28px] leading-[1.15] sm:text-[34px]">
              Bereit für den nächsten Schritt?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-600">
              Prüfen Sie ein bestehendes Zeugnis oder erstellen Sie ein neues
              – strukturiert, hash-abgesichert und nachvollziehbar.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/verify" className="btn-primary">
                Jetzt prüfen
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
              <Link href="/app/certificates/new" className="btn-secondary">
                Zeugnis erstellen
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
