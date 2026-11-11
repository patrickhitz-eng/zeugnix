import type { Metadata } from "next";
import { VerifyFlow } from "@/components/forms/verify-flow";

export const metadata: Metadata = {
  title: "Zeugnis prüfen",
  description:
    "Scannen Sie den QR-Code auf einem Arbeitszeugnis oder laden Sie es als PDF hoch. Wir prüfen den Hash und analysieren die Formulierungen.",
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; hash?: string | string[] }>;
}) {
  const { tier, hash } = await searchParams;
  // Alte PDFs tragen den Hash als ?hash=, neue als #hash= (das sieht nur der
  // Browser). Beides wertet VerifyFlow aus; hier wird nur durchgereicht.
  const queryHash = typeof hash === "string" ? hash : undefined;
  // Premium und Analyse schalten zusätzlich die Klartext-Analyse frei.
  const analysisTier =
    tier === "premium" || tier === "analyse" ? tier : undefined;

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
            {analysisTier
              ? "Laden Sie ein Arbeitszeugnis als PDF hoch. Wir prüfen den Hash und analysieren die Formulierungen nach Schweizer Arbeitszeugnislogik."
              : "Scannen Sie den QR-Code auf dem Zeugnis oder laden Sie es als PDF hoch. Wir vergleichen den Hash mit unserer Datenbank."}
          </p>
        </div>

        <VerifyFlow tier={analysisTier} queryHash={queryHash} />

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
          Ein QR-Code allein belegt nur, dass ein Zeugnis registriert ist, nicht,
          dass das vorliegende Dokument denselben Text trägt.
        </div>
      </div>
    </section>
  );
}
