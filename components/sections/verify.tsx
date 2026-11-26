// Nachgebauter Bildschirm: der Moment NACH dem Hochladen auf zeugnio.ch/verify.
// Felder, Bezeichnungen und Reihenfolge stammen aus der echten Ergebnisansicht:
//   - Echtheit: components/forms/verify-uploader.tsx (Zustand "verified":
//     «Resultat», «Registriert und unverändert», «Aussteller bestätigt»,
//     «Registrierte Angaben», «Vollsiegel …», «SHA-256 Hash»).
//   - Klartext: components/forms/verify-analysis-result.tsx (Kopf
//     «Zeugnisanalyse», «Gesamturteil», Score x / 6, Vertrauensniveau,
//     Schlussformel, fünf Kategorie-Balken, «Auffälligkeiten», Hinweis zur
//     Heuristik). Die Werte passen zur Engine in lib/phrases/analyze.ts
//     (gut = 4.5, Balken sehr_gut 95 % / gut 75 %, Warntext wörtlich).
// Bewusst weggelassen: das Badge «Kryptografisch signiert», weil es nur bei
// gültiger Ed25519-Signatur im PDF erscheint (signatureValid) und nicht jedes
// Zeugnis eine trägt; die Preise, weil sie im
// Preise-Abschnitt (pricing.tsx) stehen. Die Klartext-Auswertung erscheint in
// der App nur mit ?tier=analyse oder ?tier=premium, darum der Hinweis in der
// Bildunterschrift. Alle Namen und der Hash sind erfunden.
//
// Vorbilder (Mobbin, nur Aufbau): OKX «Identity verified» (Status oben, darunter
// eine Karte mit den bestätigten Angaben), Airwallex ID-Verifikation (Status
// als Pille neben der Angabe), Uxcel «Competency analysis» (Kennzahl mit Balken
// pro Kategorie).

const ITEMS = [
  // Wortlaut der App: «Registriert und unverändert», «Kopf-/Unterschriftsdaten
  // weichen ab», «Widerrufen», «Nicht in Datenbank», «Keine Echtheitsmarker»
  // (verify-uploader.tsx). Alle fünf Zustände genannt, damit die Liste nicht
  // mehr verspricht, als die Prüfung unterscheidet.
  "Ergebnis: registriert und unverändert, Kopf- oder Unterschriftsdaten abweichend, widerrufen, nicht in der Datenbank oder ohne Echtheitsmarker",
  "Score-Karte für Fachleistung, Verhalten, Schlussformel",
  "Hinweise auf Auffälligkeiten und potenzielle Negativcodes",
];

const REGISTERED = [
  { label: "Mitarbeiter/in", value: "Anna Muster" },
  { label: "Arbeitgeber", value: "Muster AG", domain: "muster.ch" },
  { label: "Dokument", value: "Arbeitszeugnis" },
  { label: "Ausgestellt am", value: "31.10.2026" },
] as const;

// Erfundener Prüfwert im Format der App (64 Zeichen, 0–9 und a–f).
const SAMPLE_HASH =
  "4f1c9a27e8b30d6d5a92c7e1f04b8e3a61d2c5f9b07e4a18c3d6f2e9a5b1c7d0";

const CATEGORIES = [
  { label: "Fachleistung", rating: "Sehr gut", pct: 95 },
  { label: "Arbeitsweise", rating: "Gut", pct: 75 },
  { label: "Arbeitsqualität", rating: "Gut", pct: 75 },
  { label: "Zielerreichung", rating: "Gut", pct: 75 },
  { label: "Verhalten", rating: "Sehr gut", pct: 95 },
] as const;

function CheckIcon({
  size,
  strokeWidth,
  className,
}: {
  size: number;
  strokeWidth: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function VerifySection() {
  return (
    <section className="border-b border-ink-200 bg-canvas py-24">
      <div className="container-zx">
        <div className="grid items-start gap-14 lg:grid-cols-12">
          {/* Der Bildschirm rechts ist deutlich höher als der Text: der Text
              bleibt darum auf dem Desktop beim Scrollen stehen. */}
          <div className="lg:sticky lg:top-28 lg:col-span-5">
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
              {ITEMS.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-[14px] text-ink-700"
                >
                  <CheckIcon
                    size={14}
                    strokeWidth={2.5}
                    className="mt-1 flex-shrink-0 text-petrol-600"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mock-UI: Ergebnis der Verify-Seite nach dem Hochladen */}
          <figure className="flex min-w-0 flex-col lg:col-span-7">
            {/* Im DOM zuerst, damit Screenreader vor dem Mock hören, dass alles
                erfunden ist; optisch bleibt die Bildunterschrift unten. */}
            <figcaption className="order-last mt-3 px-1 text-[12px] leading-relaxed text-ink-500">
              Beispielansicht mit erfundenen Angaben. Die Klartext-Auswertung
              gehört zur Zeugnisanalyse und zur Premium-Prüfung.
            </figcaption>
            <div className="rounded-2xl border border-ink-200 bg-white p-2 shadow-2xl shadow-ink-900/[0.06]">
              {/* Faux Browser Bar */}
              <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
                <div className="flex gap-1.5" aria-hidden="true">
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                </div>
                <div className="ml-3 flex-1 rounded-md bg-ink-50 px-3 py-1 text-[11px] text-ink-500">
                  zeugnio.ch/verify
                </div>
              </div>

              {/* Inhalt */}
              <div className="space-y-4 bg-ink-50/50 p-3 sm:p-5">
                {/* 1. Echtheit */}
                <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                  <div className="bg-petrol-700 px-4 py-4 text-white sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                        <CheckIcon size={18} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                          Resultat
                        </div>
                        <div className="text-[16px] font-medium leading-snug">
                          Registriert und unverändert
                        </div>
                        <div className="text-[11.5px] opacity-90">
                          Aussteller bestätigt
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 sm:p-5">
                    <p className="text-[12.5px] leading-relaxed text-ink-700">
                      Der berechnete Hash dieses Dokuments stimmt mit einem auf
                      zeugnio.ch registrierten Arbeitszeugnis überein.
                    </p>

                    <div className="rounded-md border border-petrol-200 bg-petrol-50/50 p-3.5">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-petrol-700">
                        Registrierte Angaben
                      </div>
                      <div className="mt-2 inline-flex items-start gap-1.5 rounded-full bg-petrol-100 px-2.5 py-1 text-[10.5px] font-medium leading-snug text-petrol-800">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="mt-px flex-shrink-0"
                        >
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <polyline points="9 12 11 14 15 10" />
                        </svg>
                        <span>
                          Vollsiegel · Aussteller, Titel und Unterzeichnende
                          sind hash-gesichert
                        </span>
                      </div>
                      {/* lg (1024 px): Spalte nur ~180 px, die Domain-Pille
                          würde umbrechen, darum dort einspaltig. */}
                      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {REGISTERED.map((f) => (
                          <div key={f.label}>
                            <dt className="text-[10.5px] text-ink-500">
                              {f.label}
                            </dt>
                            <dd className="text-[12.5px] font-medium text-ink-800">
                              {f.value}
                            </dd>
                            {"domain" in f ? (
                              <dd className="mt-1 inline-flex items-center gap-1 rounded-full bg-petrol-100 px-2 py-0.5 text-[10.5px] font-medium text-petrol-800">
                                <CheckIcon size={10} strokeWidth={3} />
                                Domain verifiziert · {f.domain}
                              </dd>
                            ) : null}
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div className="rounded-md bg-ink-50 p-3.5">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                        SHA-256 Hash
                      </div>
                      <div
                        className="mt-1 break-all font-mono text-[10.5px] text-ink-700"
                        aria-hidden="true"
                      >
                        {SAMPLE_HASH}
                      </div>
                      <span className="sr-only">64-stelliger Beispielwert</span>
                    </div>

                    {/* Wortlaut wie in verify-uploader.tsx: die App zeigt diese
                        Einschränkung im Zustand «verified» immer an. */}
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                      <strong>Hinweis:</strong> Die Verifikation bestätigt die
                      Identität des Inhalts mit dem registrierten Original. Sie
                      bestätigt nicht die materielle Richtigkeit der Aussagen im
                      Zeugnis.
                    </div>
                  </div>
                </div>

                {/* 2. Klartext-Auswertung */}
                <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3.5 sm:px-5">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                        Zeugnisanalyse
                      </div>
                      <div className="mt-0.5 text-[13.5px] font-medium text-ink-900">
                        Aussagekraft des Zeugnisses
                      </div>
                    </div>
                    <span className="rounded-full bg-petrol-50 px-2.5 py-1 text-[10.5px] font-medium text-petrol-700">
                      Gesamturteil: Gut
                    </span>
                  </div>

                  <div className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <div className="rounded-md bg-ink-50 px-2.5 py-1.5">
                        <span className="text-ink-500">Score </span>
                        <span className="font-medium text-ink-900">
                          4.5 / 6
                        </span>
                      </div>
                      <div className="rounded-md bg-ink-50 px-2.5 py-1.5">
                        <span className="text-ink-500">Vertrauensniveau </span>
                        <span className="font-medium text-ink-900">Hoch</span>
                      </div>
                      <div className="rounded-md bg-ink-50 px-2.5 py-1.5">
                        <span className="text-ink-500">Schlussformel </span>
                        <span className="font-medium text-ink-900">
                          Stark – echtes Bedauern
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                      {CATEGORIES.map((c) => (
                        <div key={c.label}>
                          <div className="flex justify-between gap-2 text-[11px]">
                            <span className="text-ink-600">{c.label}</span>
                            <span className="font-medium text-ink-900">
                              {c.rating}
                            </span>
                          </div>
                          <div
                            className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-petrol-600"
                              style={{ width: `${c.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="text-[11px] font-medium text-ink-900">
                        Auffälligkeiten
                      </div>
                      <ul className="mt-1.5">
                        <li className="flex items-start gap-2 text-[11.5px] leading-relaxed text-amber-900">
                          <span
                            className="flex-shrink-0 text-amber-600"
                            aria-hidden="true"
                          >
                            !
                          </span>
                          <span>
                            «Im Grossen und Ganzen» ist eine relativierende
                            Formulierung mit kritischem Beigeschmack.
                          </span>
                        </li>
                      </ul>
                    </div>

                    <p className="text-[10.5px] leading-relaxed text-ink-500">
                      Die Analyse ist eine heuristische Einschätzung der
                      Formulierungen und ersetzt keine rechtliche Beratung.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
