import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zeugnis prüfen",
  description:
    "Laden Sie ein Arbeitszeugnis hoch. Wir prüfen den Hash und analysieren die Formulierungen nach Schweizer Arbeitszeugnislogik.",
};

export default function VerifyPage() {
  return (
    <section className="border-b border-ink-200 bg-white py-20">
      <div className="container-zx max-w-4xl">
        <div className="text-center">
          <div className="eyebrow">Zeugnis prüfen</div>
          <h1 className="headline-display mt-3 text-[40px] leading-[1.1] sm:text-[52px]">
            Echtheit prüfen.
            <br />
            <span className="font-display italic text-petrol-700">
              Aussagekraft verstehen.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-600">
            Laden Sie ein Arbeitszeugnis als PDF hoch. Wir berechnen den Hash
            neu, vergleichen ihn mit unserer Datenbank und analysieren die
            Formulierungen nach Schweizer Arbeitszeugnislogik.
          </p>
        </div>

        {/* Upload */}
        <div className="mt-12 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50/40 p-12 text-center transition-colors hover:border-petrol-300 hover:bg-petrol-50/30">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto text-ink-400"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="mt-4 text-[16px] font-medium text-ink-900">
            PDF hierher ziehen oder durchsuchen
          </p>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Ein Arbeitszeugnis pro Upload · max. 10 MB
          </p>
          <button className="btn-primary mt-6">Datei auswählen</button>
        </div>

        {/* Disclaimer */}
        <div
          id="disclaimer"
          className="mt-10 rounded-lg bg-ink-50/60 px-6 py-5 text-[13px] leading-relaxed text-ink-600"
        >
          <span className="font-medium text-ink-900">
            Hinweis zur Verifikation:
          </span>{" "}
          Die Verifikation prüft, ob der aus dem hochgeladenen Dokument
          berechnete Inhaltshash mit einem registrierten Hash übereinstimmt. Sie
          bestätigt nicht die materielle Richtigkeit des Zeugnisinhalts.
        </div>
      </div>
    </section>
  );
}
