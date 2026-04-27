const steps = [
  {
    num: "Schritt 1",
    title: "Zeugnisprojekt anlegen",
    body: "HR oder Arbeitgeber erfasst Mitarbeiterin, Funktion, Eintritt und Austritt. Firmenlogo wird einmalig hochgeladen.",
  },
  {
    num: "Schritt 2",
    title: "Führungskraft einladen",
    body: "E-Mail-Einladung per Magic Link oder Einmal-Code. Kein vollständiger Account nötig – nur das Beurteilungsformular.",
  },
  {
    num: "Schritt 3",
    title: "Strukturiert beurteilen",
    body: "Die Führungskraft wählt pro Kategorie eine Bewertung von ungenügend bis sehr gut. Optional Freitext zu Projekten oder besonderen Leistungen.",
  },
  {
    num: "Schritt 4",
    title: "Zeugnis automatisch generieren",
    body: "Die Baustein-Engine erstellt den Zeugnistext. Korrekte Pronomen, Schweizer Rechtschreibung, einheitlicher Ton, keine plumpen Wiederholungen.",
  },
  {
    num: "Schritt 5",
    title: "Finalisieren mit Hash und QR-Code",
    body: "Beim Finalisieren wird der SHA-256-Hash berechnet, im PDF verankert und in der Datenbank registriert. Spätere Verifikation jederzeit möglich.",
  },
];

export function WorkflowSection() {
  return (
    <section className="border-b border-ink-200 bg-white py-24">
      <div className="container-zx">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="eyebrow">So entsteht ein Zeugnis</div>
            <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
              Vom Beurteilungsformular zum verifizierten PDF.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
              Führungskräfte sollen nicht das Zeugnis schreiben. Sie sollen
              strukturiert beurteilen. Die Plattform erstellt daraus den
              juristisch sauberen Zeugnistext.
            </p>

            <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50/60 p-5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Bewertungsskala
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Ungenügend", "Genügend", "Gut", "Sehr gut"].map((s, i) => (
                  <span
                    key={s}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                      i === 3
                        ? "bg-petrol-700 text-white"
                        : i === 2
                          ? "bg-petrol-50 text-petrol-700"
                          : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <ol className="relative">
              {/* Vertikale Verbindungslinie */}
              <div
                aria-hidden="true"
                className="absolute left-[18px] top-3 h-[calc(100%-1.5rem)] w-px bg-ink-200"
              />
              {steps.map((step, i) => (
                <li key={step.title} className="relative pb-7 pl-14 last:pb-0">
                  <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white font-mono text-[11px] font-medium text-petrol-700">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                    {step.num}
                  </div>
                  <h3 className="mt-1 text-[16.5px] font-medium tracking-tight text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
