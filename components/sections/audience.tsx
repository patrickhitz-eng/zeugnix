import Link from "next/link";

// Aufbau (seit 20.11.2026): vier kompakte Karten mit Titel, einem Satz Nutzen
// und «Mehr erfahren». Die bisherigen Detailpunkte stehen wörtlich auf den
// Unterseiten (for-employers: kmuFeatures und treuhandFeatures,
// for-candidates und for-recruiters: ihre Vorteilslisten) und sind darum
// hier entfallen. Vorbilder auf Mobbin: Grain und Givingli (kurze Karten,
// Link unten) und Mural (Link am Kartenfuss bündig).
//
// Treuhänder haben keine eigene Seite. Sie verlinken auf /for-employers: Die
// Seite richtet sich laut Eyebrow an «Arbeitgeber, KMU & Treuhänder» und hat
// eine eigene Karte «Treuhänder & HR-Berater» mit den Firmenfunktionen.
//
// Jede Aussage ist im Code belegt (UWG Art. 3 Abs. 1 lit. b):
// - Satzbausteine und Link für die vorgesetzte Person: lib/phrases,
//   app/(public)/app/signoffs/[token] und invitations/[token].
// - Klartext-Analyse: app/verify/page.tsx (Tier «analyse» und «premium»).
// - Echtheitsprüfung registrierter Zeugnisse: /verify.
// - Mehrere Firmen, Logo und Fusszeile pro Firma: app/(authed)/app/company
//   («Weitere Firma anlegen»), lib/company/payload.ts (certificate_footer),
//   /api/companies/[id]/logo.
//
// Barrierefreiheit: Pro Karte genau ein <a>. Der Link «Mehr erfahren» wird
// per ::after über die ganze Karte gezogen (keine verschachtelten Links),
// sein zugänglicher Name nennt die Zielgruppe mit. role="list" am <ul>, weil
// Safari/VoiceOver die Listensemantik bei list-style: none (Preflight) verwirft.
//
// Im Vier-Spalten-Raster (lg) halten die Titel zwei Zeilen Höhe (min-h-[2lh]),
// damit die Nutzensätze trotz Umbruch von «Kandidatinnen & Kandidaten» auf
// gleicher Höhe beginnen.
const audiences = [
  {
    title: "Arbeitgeber & KMU",
    href: "/for-employers",
    body: "Zeugnisse aus Satzbausteinen erstellen, die vorgesetzte Person per Link bewerten lassen und als prüfbares PDF abschliessen.",
  },
  {
    title: "Kandidatinnen & Kandidaten",
    href: "/for-candidates",
    body: "Die Formulierungen im eigenen Zeugnis in Klartext übersetzen lassen und verstehen, was sie aussagen.",
  },
  {
    title: "Recruiter",
    href: "/for-recruiters",
    body: "Eingereichte Zeugnisse einheitlich interpretieren und bei registrierten Zeugnissen die Echtheit prüfen.",
  },
  {
    title: "Treuhänder & HR-Berater",
    href: "/for-employers",
    body: "Zeugnisse für mehrere Firmen aus einem Konto erstellen, jede mit eigenem Logo und eigener Fusszeile.",
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
            Anforderungen. zeugnio.ch deckt alle vier ab – ohne dass eine Seite
            den Workflow der anderen stört.
          </p>
        </div>

        <ul
          role="list"
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {audiences.map((a) => (
            <li
              key={a.title}
              className="group relative flex flex-col rounded-xl border border-ink-200 bg-white p-6 transition-colors hover:border-petrol-300 hover:bg-ink-50/40 motion-reduce:transition-none"
            >
              <h3 className="text-[17px] font-medium leading-snug tracking-tight text-ink-900 lg:min-h-[2lh]">
                {a.title}
              </h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-600">
                {a.body}
              </p>
              <Link
                href={a.href}
                className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[13.5px] font-medium text-petrol-700 after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-petrol-600 focus-visible:after:ring-offset-2"
              >
                Mehr erfahren
                <span className="sr-only">: {a.title}</span>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
