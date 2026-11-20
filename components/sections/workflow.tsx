"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/*
 * «So entsteht ein Zeugnis» als Stepper: oben die fünf Schritte, darunter
 * der Text zum gewählten Schritt und ein nachgebauter Bildschirm der App.
 * Vorbild für den Aufbau (Schritte nebeneinander, Produkt-Screen darunter):
 * Sequence auf Mobbin. Farben, Schrift und Texte bleiben die von zeugnio.
 *
 * Bedienung nach dem Tabs-Muster der WAI-ARIA Authoring Practices:
 * Pfeiltasten wechseln den Schritt, Pos1/Ende springen an den Anfang/das Ende.
 * Alle Namen und Daten in den Bildschirmen sind erfunden.
 */

type Step = {
  title: string;
  body: string;
  url: string;
  screen: ReactNode;
};

const steps: Step[] = [
  {
    title: "Zeugnisprojekt anlegen",
    body: "HR oder Arbeitgeber erfasst Mitarbeiterin, Funktion, Eintritt und Austritt. Firmenlogo wird einmalig hochgeladen.",
    url: "zeugnio.ch/app/certificates/new",
    screen: <ScreenProjekt />,
  },
  {
    title: "Führungskraft einladen",
    body: "E-Mail-Einladung per Magic Link oder Einmal-Code. Kein vollständiger Account nötig – nur das Beurteilungsformular.",
    url: "zeugnio.ch/app/certificates",
    screen: <ScreenEinladen />,
  },
  {
    title: "Strukturiert beurteilen",
    body: "Die Führungskraft wählt pro Kategorie eine Bewertung von ungenügend bis sehr gut. Optional Freitext zu Projekten oder besonderen Leistungen.",
    url: "zeugnio.ch/app/invitations/…",
    screen: <ScreenBeurteilen />,
  },
  {
    title: "Zeugnis automatisch generieren",
    body: "Die Baustein-Engine erstellt den Zeugnistext. Korrekte Pronomen, Schweizer Rechtschreibung, einheitlicher Ton, keine plumpen Wiederholungen.",
    url: "zeugnio.ch/app/certificates/…",
    screen: <ScreenGenerieren />,
  },
  {
    title: "Finalisieren mit Hash und QR-Code",
    body: "Beim Finalisieren wird der SHA-256-Hash berechnet, im PDF verankert und in der Datenbank registriert. Danach lässt sich das Zeugnis über zeugnio.ch/verify prüfen.",
    url: "zeugnio.ch/app/certificates/…",
    screen: <ScreenFinalisieren />,
  },
];

const nr = (i: number) => String(i + 1).padStart(2, "0");

/**
 * `withSolution`: Auf der Startseite ist die frühere dunkle Sektion «Die
 * Lösung» in diesen Abschnitt aufgegangen (Kopf und Zitat). Ihre vier Karten
 * zeigt jetzt der Stepper, zusammen mit «Echtheit prüfen». Die anderen Seiten
 * nutzen den schlichten Kopf, weil dort «Die Lösung» zum Teil noch davor steht.
 */
export function WorkflowSection({
  withSolution = false,
}: {
  withSolution?: boolean;
}) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(i: number) {
    setActive(i);
    tabRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const last = steps.length - 1;
    if (e.key === "ArrowRight") select(active === last ? 0 : active + 1);
    else if (e.key === "ArrowLeft") select(active === 0 ? last : active - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(last);
    else return;
    e.preventDefault();
  }

  const step = steps[active];

  return (
    <section className="border-b border-ink-200 bg-white py-24">
      <div className="container-zx">
        {withSolution ? (
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-6">
              <div className="eyebrow">Die Lösung</div>
              <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
                Ein Zeugnis. Ein Hash.
                <br />
                <span className="font-display italic text-petrol-700">
                  Eine verständliche Auswertung.
                </span>
              </h2>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-ink-600 lg:col-span-5 lg:col-start-8">
              <p>
                Bisher wurden Arbeitszeugnisse geschrieben, abgelegt und
                weitergeleitet. Neu werden sie strukturiert erstellt,
                kryptografisch abgesichert, später verifiziert und inhaltlich
                analysiert.
              </p>
              <p>
                Führungskräfte sollen nicht das Zeugnis schreiben. Sie sollen
                strukturiert beurteilen. Die Plattform erstellt daraus einen
                einheitlichen Zeugnistext nach Schweizer Zeugnispraxis.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-6">
              <div className="eyebrow">So entsteht ein Zeugnis</div>
              <h2
                id="workflow-heading"
                className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]"
              >
                Vom Beurteilungsformular zum verifizierten PDF.
              </h2>
            </div>
            <p className="text-[15px] leading-relaxed text-ink-600 lg:col-span-5 lg:col-start-8">
              Führungskräfte sollen nicht das Zeugnis schreiben. Sie sollen
              strukturiert beurteilen. Die Plattform erstellt daraus einen
              einheitlichen Zeugnistext nach Schweizer Zeugnispraxis.
            </p>
          </div>
        )}

        {/* Schritte */}
        {withSolution && (
          <h3
            id="workflow-heading"
            className="mt-14 text-[11px] font-medium uppercase tracking-wider text-ink-500"
          >
            So entsteht ein Zeugnis: vom Beurteilungsformular zum verifizierten
            PDF
          </h3>
        )}
        <div
          role="tablist"
          aria-labelledby="workflow-heading"
          className={`${withSolution ? "mt-4" : "mt-12"} grid grid-cols-5 gap-2 sm:gap-4`}
        >
          {steps.map((s, i) => {
            const selected = i === active;
            const done = i < active;
            return (
              <button
                key={s.title}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`workflow-tab-${i}`}
                aria-selected={selected}
                aria-controls="workflow-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={onKeyDown}
                className="group text-left focus-visible:outline-none"
              >
                {/* Fortschrittsbalken */}
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full bg-petrol-600 transition-all duration-300 motion-reduce:transition-none ${
                      selected || done ? "w-full" : "w-0"
                    } ${done ? "opacity-40" : ""}`}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-medium transition-colors group-focus-visible:ring-2 group-focus-visible:ring-petrol-500 group-focus-visible:ring-offset-2 ${
                      selected
                        ? "border-petrol-700 bg-petrol-700 text-white"
                        : "border-ink-200 bg-white text-petrol-700 group-hover:border-petrol-300"
                    }`}
                  >
                    {nr(i)}
                  </span>
                  <span
                    className={`hidden text-[13.5px] font-medium leading-snug tracking-tight transition-colors lg:block ${
                      selected
                        ? "text-ink-900"
                        : "text-ink-500 group-hover:text-ink-800"
                    }`}
                  >
                    {s.title}
                  </span>
                  <span className="sr-only lg:hidden">{s.title}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Gewählter Schritt */}
        <div
          role="tabpanel"
          id="workflow-panel"
          aria-labelledby={`workflow-tab-${active}`}
          className="mt-8 grid gap-8 rounded-2xl border border-ink-200 bg-ink-50/50 p-4 sm:p-8 lg:grid-cols-12 lg:gap-10"
        >
          <div className="lg:col-span-4 lg:pt-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Schritt {active + 1} von {steps.length}
            </div>
            <h3 className="mt-2 font-display text-[24px] font-light leading-tight tracking-tight text-ink-900">
              {step.title}
            </h3>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">
              {step.body}
            </p>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setActive(Math.max(0, active - 1))}
                disabled={active === 0}
                className="btn-secondary px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() =>
                  setActive(Math.min(steps.length - 1, active + 1))
                }
                disabled={active === steps.length - 1}
                className="btn-primary px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Nächster Schritt
              </button>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-8">
            <BrowserFrame url={step.url}>
              <div
                key={active}
                className="animate-fade-in motion-reduce:animate-none"
              >
                {step.screen}
              </div>
            </BrowserFrame>
          </div>
        </div>

        {withSolution && (
          <p className="mx-auto mt-14 max-w-2xl text-center font-display text-[19px] italic leading-relaxed text-ink-700">
            «Wir machen aus dem klassischen Arbeitszeugnis ein überprüfbares,
            verständliches und digitales Vertrauensdokument.»
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- Rahmen und Bausteine für die nachgebauten Bildschirme ---------- */

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-2 shadow-2xl shadow-ink-900/[0.06]">
      <div
        aria-hidden="true"
        className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5"
      >
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <div className="h-2.5 w-2.5 rounded-full bg-ink-200" />
        </div>
        <div className="ml-3 flex-1 truncate rounded-md bg-ink-50 px-3 py-1 text-[11px] text-ink-500">
          {url}
        </div>
      </div>
      <div className="min-h-[340px] p-4 sm:p-7">{children}</div>
    </div>
  );
}

function ScreenTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <>
      <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-700">
        {kicker}
      </div>
      <div className="mt-1.5 font-display text-[20px] font-light tracking-tight text-ink-900">
        {title}
      </div>
    </>
  );
}

function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-[11px] font-medium text-ink-600">{label}</div>
      <div className="mt-1 truncate rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900">
        {value}
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ---------- Schritt 1 ---------- */

function ScreenProjekt() {
  return (
    <div>
      <ScreenTitle
        kicker="Neues Zeugnis"
        title="Mitarbeiterdaten und Zeugnistyp"
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Vorname und Name" value="Anna Muster" />
        <Field label="Funktion" value="Sachbearbeiterin Treuhand" />
        <Field label="Eintritt" value="01.03.2021" />
        <Field label="Austritt" value="31.10.2026" />
        <div className="sm:col-span-2">
          <div className="text-[11px] font-medium text-ink-600">Zeugnistyp</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="rounded-md bg-petrol-700 px-3 py-1.5 text-[12px] font-medium text-white">
              Schlusszeugnis
            </span>
            <span className="rounded-md bg-ink-100 px-3 py-1.5 text-[12px] font-medium text-ink-600">
              Zwischenzeugnis
            </span>
            <span className="rounded-md bg-ink-100 px-3 py-1.5 text-[12px] font-medium text-ink-600">
              Arbeitsbestätigung
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <div className="flex items-center gap-2 text-[12px] text-ink-600">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-ink-900 text-[9px] font-bold text-white">
            M
          </span>
          Firmenlogo Muster AG hinterlegt
        </div>
        <span className="rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white">
          Weiter
        </span>
      </div>
    </div>
  );
}

/* ---------- Schritt 2 ---------- */

function ScreenEinladen() {
  return (
    <div>
      <ScreenTitle
        kicker="Zeugnis für Anna Muster"
        title="Führungskraft einladen"
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Name der Führungskraft" value="Marco Beispiel" />
        <Field label="E-Mail" value="marco.beispiel@muster.ch" />
      </div>
      <div className="mt-4 text-[11px] font-medium text-ink-600">
        Anmeldung für die Führungskraft
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border-2 border-petrol-600 bg-white p-3">
          <div className="text-[12.5px] font-medium text-ink-900">
            Magic Link
          </div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            Ein Klick in der E-Mail genügt
          </div>
        </div>
        <div className="rounded-md border border-ink-200 bg-white p-3">
          <div className="text-[12.5px] font-medium text-ink-900">
            Einmal-Code
          </div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            Falls Links gefiltert werden
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Wartet auf Beurteilung
        </span>
        <span className="rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white">
          Einladung senden
        </span>
      </div>
    </div>
  );
}

/* ---------- Schritt 3 ---------- */

const skala = ["Ungenügend", "Genügend", "Gut", "Sehr gut"];
const kategorien: [string, number][] = [
  ["Fachkenntnisse", 3],
  ["Arbeitsweise", 2],
  ["Zuverlässigkeit", 3],
  ["Verhalten", 3],
];

function ScreenBeurteilen() {
  return (
    <div>
      <ScreenTitle
        kicker="Beurteilung für Anna Muster"
        title="Wie beurteilen Sie die Leistung?"
      />
      <div className="mt-5 space-y-3">
        {kategorien.map(([name, wahl]) => (
          <div
            key={name}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-[12.5px] font-medium text-ink-800">{name}</div>
            <div className="grid w-full grid-cols-4 gap-0.5 sm:w-auto sm:gap-1">
              {skala.map((s, i) => (
                <span
                  key={s}
                  className={`rounded px-0.5 py-1 text-center text-[10px] font-medium sm:px-2 sm:text-[10.5px] ${
                    i === wahl
                      ? "bg-petrol-700 text-white"
                      : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="text-[11px] font-medium text-ink-600">
          Besondere Leistungen (optional)
        </div>
        <div className="mt-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-[12.5px] leading-relaxed text-ink-700">
          Hat die Umstellung auf die neue Buchhaltungssoftware im Team
          begleitet.
        </div>
      </div>
    </div>
  );
}

/* ---------- Schritt 4 ---------- */

function ScreenGenerieren() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScreenTitle kicker="Entwurf" title="Arbeitszeugnis" />
        <div className="flex flex-wrap gap-1.5">
          {["Pronomen: sie", "Schweizer Rechtschreibung"].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-petrol-50 px-2 py-0.5 text-[10.5px] font-medium text-petrol-700"
            >
              <Check />
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-3 rounded-lg border border-ink-200 bg-white p-4 font-display text-[13.5px] leading-relaxed text-ink-800">
        <p>
          Frau Anna Muster war vom 1. März 2021 bis 31. Oktober 2026 als
          Sachbearbeiterin Treuhand in unserem Unternehmen tätig.
        </p>
        <p>
          <mark className="rounded bg-petrol-50 px-0.5 text-ink-900">
            Frau Muster verfügt über fundierte Fachkenntnisse, die sie stets
            sicher und zielgerichtet einsetzte.
          </mark>{" "}
          Sie arbeitete selbständig, sorgfältig und zuverlässig.
        </p>
        <p>
          Bei der Einführung der neuen Buchhaltungssoftware begleitete sie das
          Team mit grossem Einsatz.
        </p>
        <div className="space-y-1.5 pt-1" aria-hidden="true">
          <div className="h-2 w-full rounded bg-ink-100" />
          <div className="h-2 w-4/5 rounded bg-ink-100" />
        </div>
      </div>
      <div className="mt-3 text-[11px] text-ink-500">
        Markiert: ein Satzbaustein zur Kategorie Fachkenntnisse
      </div>
    </div>
  );
}

/* ---------- Schritt 5 ---------- */

function ScreenFinalisieren() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScreenTitle
          kicker="Finalisiert"
          title="Arbeitszeugnis Anna Muster.pdf"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-petrol-700 px-2.5 py-1 text-[11px] font-medium text-white">
          <Check />
          Verifiziert · SHA-256
        </span>
      </div>
      <div className="mt-5 rounded-lg border border-ink-200 bg-white p-4">
        <div className="space-y-1.5" aria-hidden="true">
          <div className="h-2 w-full rounded bg-ink-100" />
          <div className="h-2 w-11/12 rounded bg-ink-100" />
          <div className="h-2 w-4/5 rounded bg-ink-100" />
          <div className="h-2 w-2/3 rounded bg-ink-100" />
        </div>
        <div className="mt-5 flex items-center gap-4 border-t border-dashed border-ink-200 pt-4">
          <QrMock />
          <div className="min-w-0">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-500">
              Prüfbar unter zeugnio.ch/verify
            </div>
            <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-ink-700">
              SHA-256 3f9a 61c0 8b2e … 7d14 c21e
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-[12px] text-ink-700 sm:grid-cols-3">
        {[
          "Hash berechnet",
          "Im PDF verankert",
          "In der Datenbank registriert",
        ].map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span className="text-petrol-600">
              <Check />
            </span>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Dekoratives Muster, kein echter QR-Code. */
function QrMock() {
  const cells =
    "1110111010100101011101011100110100101011110110101001110101101011".split(
      "",
    );
  return (
    <div
      aria-hidden="true"
      className="grid h-14 w-14 flex-shrink-0 grid-cols-8 gap-px rounded bg-white p-1 ring-1 ring-ink-200"
    >
      {cells.map((c, i) => (
        <div key={i} className={c === "1" ? "bg-ink-900" : "bg-white"} />
      ))}
    </div>
  );
}
