import type { Metadata } from "next";
import { VerifyUploader } from "@/components/forms/verify-uploader";

export const metadata: Metadata = {
  title: "Zeugnis prüfen",
  description:
    "Laden Sie ein Arbeitszeugnis hoch. Wir prüfen den Hash und analysieren die Formulierungen.",
};

export default function VerifyPage() {
  return (
    <section className="border-b border-ink-200 bg-white py-20">
      <div className="container-zx max-w-3xl">
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
            und vergleichen ihn mit unserer Datenbank.
          </p>
        </div>

        <div className="mt-12">
          <VerifyUploader />
        </div>

        <div
          id="disclaimer"
          className="mt-10 rounded-lg bg-ink-50/60 px-6 py-5 text-[13px] leading-relaxed text-ink-600"
        >
          <span className="font-medium text-ink-900">
            Hinweis zur Verifikation:
          </span>{" "}
          Die Verifikation prüft, ob der aus dem hochgeladenen Dokument
          berechnete Inhaltshash mit einem registrierten Hash übereinstimmt.
          Sie bestätigt nicht die materielle Richtigkeit des Zeugnisinhalts.
        </div>
      </div>
    </section>
  );
}
