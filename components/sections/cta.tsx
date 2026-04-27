import Link from "next/link";

export function CtaSection() {
  return (
    <section className="bg-white py-28">
      <div className="container-zx">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-8 py-20 text-center text-white sm:px-16">
          {/* Hintergrund-Hash */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-2 select-none break-all px-6 font-mono text-[88px] font-medium leading-[0.9] tracking-tight text-white/[0.025] sm:text-[120px]"
          >
            a3f5b9c2e7d18f4a2c9e1b7d0f6c4d8e
          </div>

          <div className="relative">
            <div className="eyebrow-light">Bereit zu starten?</div>
            <h2 className="headline-display mx-auto mt-4 max-w-2xl text-[34px] leading-[1.1] text-white sm:text-[48px]">
              Erstellen Sie Ihr erstes Zeugnis.
              <br />
              <span className="font-display italic text-petrol-300">
                Kostenlos und in wenigen Minuten.
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-relaxed text-ink-300">
              Erfassen Sie Ihre Firma, laden Sie eine Führungskraft ein und
              generieren Sie das fertige PDF mit Hash und QR-Code – ohne
              Kreditkarte, ohne Verpflichtung.
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/app/certificates/new"
                className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-medium text-ink-900 transition-all hover:bg-petrol-50 active:scale-[0.985]"
              >
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
              <Link
                href="/verify"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-transparent px-5 py-3 text-[14px] font-medium text-white transition-all hover:border-white/40 hover:bg-white/5 active:scale-[0.985]"
              >
                Zeugnis prüfen und analysieren
              </Link>
            </div>

            <p className="mt-10 font-mono text-[11px] tracking-widest text-ink-500">
              ERSTELLEN · ABSICHERN · PRÜFEN · VERSTEHEN
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
