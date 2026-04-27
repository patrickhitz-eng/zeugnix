const problems = [
  {
    num: "01",
    title: "Freundlich, aber unklar",
    body: "Arbeitszeugnisse klingen oft wohlwollend, sagen aber nicht immer dasselbe. Kandidatinnen und Kandidaten wissen häufig nicht, ob ihr Zeugnis tatsächlich gut ist.",
  },
  {
    num: "02",
    title: "Manipulierbare PDFs",
    body: "Klassische PDF-Zeugnisse können nachträglich verändert werden – ohne dass es Recruiter oder Arbeitgeber bemerken. Eine zuverlässige Echtheitsprüfung fehlt.",
  },
  {
    num: "03",
    title: "Uneinheitliche Beurteilung",
    body: "Führungskräfte beurteilen Mitarbeitende nach unterschiedlichen Massstäben. HR-Abteilungen brauchen Standardisierung, Nachvollziehbarkeit und Qualität.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-ink-200 bg-white py-24">
      <div className="container-zx">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="eyebrow">Das Problem</div>
            <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
              Wichtig – aber schwer zu prüfen, schwer zu verstehen.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-600">
              Arbeitszeugnisse sind das wichtigste Dokument im Berufsleben. Und
              gleichzeitig das undurchsichtigste. Drei strukturelle Schwächen
              prägen den Status quo:
            </p>
          </div>

          <div className="lg:col-span-7">
            <ul className="space-y-px overflow-hidden rounded-xl border border-ink-200">
              {problems.map((p) => (
                <li
                  key={p.num}
                  className="grid grid-cols-12 gap-6 bg-white p-7 transition-colors hover:bg-ink-50/40"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <span className="font-mono text-[11px] font-medium tracking-wider text-petrol-600">
                      {p.num}
                    </span>
                  </div>
                  <div className="col-span-10 sm:col-span-11">
                    <h3 className="text-[16px] font-medium tracking-tight text-ink-900">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
                      {p.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
