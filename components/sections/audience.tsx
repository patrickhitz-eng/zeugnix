import Link from "next/link";

const audiences = [
  {
    title: "Arbeitgeber & KMU",
    href: "/for-employers",
    body: "Strukturierte Erstellung mit Bausteinen, Führungskräfte-Einbindung über Magic Link und automatische Hash-Absicherung.",
    items: [
      "Weniger Aufwand pro Zeugnis",
      "Einheitliche Beurteilungsstandards",
      "Professionelle Formulierungen",
      "Arbeitgeber-Siegel möglich",
    ],
  },
  {
    title: "Kandidatinnen & Kandidaten",
    href: "/for-candidates",
    body: "Sie haben ein Zeugnis erhalten und möchten wissen, was es wirklich aussagt. Wir übersetzen Formulierungen in Klartext.",
    items: [
      "Gesamturteil in Klartext",
      "Stärken und schwächere Signale",
      "Analyse der Schlussformel",
      "Hinweise auf Auffälligkeiten",
    ],
  },
  {
    title: "Recruiter",
    href: "/for-recruiters",
    body: "Schnellere und konsistentere Vorprüfung eingereichter Zeugnisse mit standardisierter Interpretation und Echtheitsprüfung.",
    items: [
      "Schnelle Vorprüfung",
      "Standardisierte Interpretation",
      "Bessere Vergleichbarkeit",
      "Echtheitsprüfung registrierter Zeugnisse",
    ],
  },
  {
    title: "Treuhänder & HR-Berater",
    href: "/for-employers#treuhand",
    body: "Treuhandkunden professionell unterstützen – ohne selbst jedes Zeugnis schreiben zu müssen. Compliance-konform und nachvollziehbar.",
    items: [
      "Mandantenfähige Verwaltung",
      "Reduktion arbeitsrechtlicher Risiken",
      "Standardisierte Qualität",
      "Verifikationshistorie pro Mandant",
    ],
  },
];

export function AudienceSection() {
  return (
    <section className="border-b border-ink-200 bg-white py-24">
      <div className="container-zx">
        <div className="max-w-2xl">
          <div className="eyebrow">Für wen die Plattform gebaut ist</div>
          <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
            Vier Perspektiven auf dasselbe Dokument.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
            Arbeitszeugnisse betreffen vier Gruppen mit sehr unterschiedlichen
            Anforderungen. zeugnix.ch deckt alle vier ab – ohne dass eine Seite
            den Workflow der anderen stört.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2">
          {audiences.map((a) => (
            <Link
              key={a.title}
              href={a.href}
              className="group block bg-white p-7 transition-colors hover:bg-ink-50/40"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-[18px] font-medium tracking-tight text-ink-900">
                  {a.title}
                </h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-1 text-ink-400 transition-all group-hover:translate-x-0.5 group-hover:text-petrol-700"
                >
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </div>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-600">
                {a.body}
              </p>
              <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {a.items.map((it) => (
                  <li
                    key={it}
                    className="flex items-start gap-1.5 text-[12.5px] text-ink-700"
                  >
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-petrol-600" />
                    {it}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
