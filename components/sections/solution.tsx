const pillars = [
  {
    num: "01",
    label: "Erstellen",
    title: "Strukturiert mit Bausteinen",
    body: "Führungskräfte beurteilen, die Plattform formuliert. Schweizer Hochdeutsch, korrekte Pronomen, einheitlicher Ton.",
  },
  {
    num: "02",
    label: "Absichern",
    title: "Hash und QR-Code im PDF",
    body: "Beim Finalisieren wird ein SHA-256-Hash über den kanonisierten Inhalt berechnet und im Dokument verankert.",
  },
  {
    num: "03",
    label: "Prüfen",
    title: "Echtheit über Hash-Vergleich",
    body: "Recruiter laden das PDF hoch. Das System rechnet den Hash neu und vergleicht ihn mit dem Original.",
  },
  {
    num: "04",
    label: "Verstehen",
    title: "Klartext-Auswertung",
    body: "Formulierungen werden mit der Bausteinbibliothek abgeglichen und in eine verständliche Bewertung übersetzt.",
  },
];

export function SolutionSection() {
  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-ink-900 py-28 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container-zx relative">
        <div className="max-w-2xl">
          <div className="eyebrow-light">Die Lösung</div>
          <h2 className="headline-display mt-3 text-[34px] leading-[1.15] text-white sm:text-[44px]">
            Ein Zeugnis. Ein Hash.
            <br />
            <span className="font-display italic text-petrol-300">
              Eine verständliche Auswertung.
            </span>
          </h2>
          <p className="mt-6 text-[15.5px] leading-relaxed text-ink-300">
            Bisher wurden Arbeitszeugnisse geschrieben, abgelegt und
            weitergeleitet. Neu werden sie strukturiert erstellt, kryptografisch
            abgesichert, später verifiziert und inhaltlich analysiert.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div
              key={p.num}
              className="bg-ink-900 p-7 transition-colors hover:bg-ink-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] font-medium tracking-[0.18em] text-petrol-300">
                  {p.num} · {p.label.toUpperCase()}
                </span>
              </div>
              <h3 className="mt-6 text-[15.5px] font-medium tracking-tight text-white">
                {p.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-400">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-12 max-w-2xl font-display text-[19px] italic leading-relaxed text-ink-200">
          „Wir machen aus dem klassischen Arbeitszeugnis ein überprüfbares,
          verständliches und digitales Vertrauensdokument."
        </p>
      </div>
    </section>
  );
}
