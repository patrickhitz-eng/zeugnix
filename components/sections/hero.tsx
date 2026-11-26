import Link from "next/link";
import { CertificateMockup } from "@/components/marketing/certificate-mockup";
import { AnalysisCard } from "@/components/marketing/analysis-card";
import { siteConfig } from "@/lib/site-config";

const trustBadges = [
  "Nach Schweizer Zeugnispraxis",
  "Original online prüfbar",
  "Klartext-Zeugnisanalyse",
  "Für KMU, HR & Recruiter",
  "Kostenlos erstellen",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-petrol-900 bg-petrol-800 text-petrol-50">
      {/* Subtile Hintergrund-Linien für Schweizer LegalTech-Stil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #FFFFFF 1px, transparent 1px)",
          backgroundSize: "80px 100%",
        }}
      />

      <div className="container-zx relative grid gap-16 py-20 lg:grid-cols-12 lg:gap-12 lg:py-28">
        <div className="lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-petrol-600 bg-petrol-700/60 px-3 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-petrol-200 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-petrol-200" />
            </span>
            {/*
             * Badge und Untertitel in Alltagssprache für HR in KMU. Der Hash
             * macht nachträgliche Änderungen ERKENNBAR, er verhindert sie
             * nicht: darum «Änderungen erkennbar» und «registriertes Original»,
             * nie «fälschungssicher», «rechtssicher» oder «Echtheit» (UWG
             * Art. 3 Abs. 1 lit. b). «Echtheit» meint beim Zeugnis auch die
             * Herkunft vom Arbeitgeber. Die belegt das Siegel nicht: Ein
             * einzelnes Konto kann eine Firma unter freiem Namen anlegen, selbst
             * beurteilen und finalisieren (verify-uploader.tsx, Kommentar beim
             * Ergebnis «verified»). /verify meldet darum «Registriert und
             * unverändert», ohne Treffer «Nicht in Datenbank» mit drei
             * möglichen Gründen. Die Prüfung braucht das PDF, darum kein
             * «sofort» und keine Zusage für Scans oder Papier.
             * «kostenlos» hängt nur an der Erstellung (Preisseite CHF 0); die
             * Prüfung kostet nach der Beta CHF 19.90, darum ein eigener Satz.
             */}
            <span className="text-[12px] font-medium text-petrol-100">
              Schweizer Zeugnispraxis · Änderungen erkennbar
            </span>
          </div>

          <h1 className="headline-display mt-6 text-[44px] text-white leading-[1.04] sm:text-[56px] lg:text-[64px]">
            Arbeitszeugnisse
            <br />
            <span className="font-display italic text-petrol-200">
              komplett neu gedacht.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-petrol-100">
            Die Führungskraft beurteilt, zeugnio formuliert daraus das Zeugnis.
            Die Erstellung ist kostenlos. Wer das PDF später auf zeugnio.ch
            hochlädt, sieht, ob es unverändert einem registrierten Original
            entspricht.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={siteConfig.signup.cta.href} className="btn-deep">
              {siteConfig.signup.open
                ? "Arbeitszeugnis kostenlos erstellen"
                : siteConfig.signup.cta.label}
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
            <Link href="/verify" className="btn-deep-outline">
              Zeugnis prüfen und analysieren
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-petrol-100">
            Erstellen. Absichern. Prüfen. Verstehen.
          </p>

          {/* Trust-Badges */}
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-petrol-700 pt-6">
            {trustBadges.map((badge) => (
              <li
                key={badge}
                className="flex items-center gap-1.5 text-[12.5px] text-petrol-100"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="text-petrol-200"
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
            <div className="absolute -right-2 top-6 seal-pill px-3 py-1.5 text-[11.5px] shadow-lg shadow-black/25 lg:-right-6 lg:top-10">
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
