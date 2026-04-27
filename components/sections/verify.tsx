export function VerifySection() {
  return (
    <section className="border-b border-ink-200 bg-ink-50/40 py-24">
      <div className="container-zx">
        <div className="grid items-start gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="eyebrow">Echtheit & Klartext</div>
            <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
              Echtheit prüfen.
              <br />
              <span className="font-display italic text-petrol-700">
                Aussagekraft verstehen.
              </span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
              Laden Sie ein Arbeitszeugnis als PDF hoch. Wir berechnen den Hash
              neu, vergleichen ihn mit unserer Datenbank und analysieren die
              Formulierungen nach Schweizer Arbeitszeugnislogik.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                "Verifikationsergebnis: verifiziert, nicht verifiziert oder unbekannt",
                "Score-Karte für Fachleistung, Verhalten, Schlussformel",
                "Hinweise auf Auffälligkeiten und potenzielle Negativcodes",
                "PDF-Bericht für Bewerbungsdossier oder HR-Akte",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] text-ink-700">
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

          {/* Mock-UI der Verify-Seite */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-ink-200 bg-white p-2 shadow-2xl shadow-ink-900/[0.06]">
              {/* Faux Browser Bar */}
              <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                </div>
                <div className="ml-3 flex-1 rounded-md bg-ink-50 px-3 py-1 text-[11px] text-ink-500">
                  zeugnix.ch/verify
                </div>
              </div>

              {/* Inhalt */}
              <div className="p-7">
                <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-700">
                  Zeugnis prüfen
                </div>
                <h3 className="mt-2 font-display text-[22px] font-light tracking-tight text-ink-900">
                  PDF hochladen
                </h3>

                <div className="mt-5 rounded-lg border-2 border-dashed border-ink-200 bg-ink-50/50 p-6 text-center">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto text-ink-400"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="mt-2 text-[13px] font-medium text-ink-700">
                    Datei hierher ziehen oder durchsuchen
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    PDF · max. 10 MB
                  </p>
                </div>

                {/* Drei Produkt-Karten */}
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-ink-200 p-3">
                    <div className="text-[11px] font-medium text-ink-900">
                      Echtheit prüfen
                    </div>
                    <div className="mt-1 text-[15px] font-medium tracking-tight text-ink-900">
                      CHF 19.90
                    </div>
                  </div>
                  <div className="relative rounded-md border-2 border-petrol-600 p-3">
                    <span className="absolute -top-2 left-2 rounded-full bg-petrol-700 px-1.5 py-0.5 text-[8.5px] font-medium text-white">
                      Empfohlen
                    </span>
                    <div className="text-[11px] font-medium text-ink-900">
                      Premium-Prüfung
                    </div>
                    <div className="mt-1 text-[15px] font-medium tracking-tight text-ink-900">
                      CHF 39.90
                    </div>
                  </div>
                  <div className="rounded-md border border-ink-200 p-3">
                    <div className="text-[11px] font-medium text-ink-900">
                      Analyse
                    </div>
                    <div className="mt-1 text-[15px] font-medium tracking-tight text-ink-900">
                      CHF 29.90
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
