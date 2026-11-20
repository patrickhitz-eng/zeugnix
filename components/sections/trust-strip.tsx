import Image from "next/image";

/*
 * Vertrauensstreifen direkt unter dem Hero.
 *
 * HEUTE UNSICHTBAR: Solange PILOT_LOGOS leer ist und SHOW_SWISS_HOSTING
 * false, gibt die Komponente null zurück. Es entsteht kein leerer Abstand.
 *
 * Vorbild für den Aufbau (kleine Zeile über einer ruhigen Reihe von Logos in
 * Graustufen, direkt unter dem Hero): Duna und Lyssna auf Mobbin. Farben,
 * Schrift und Texte bleiben die von zeugnio.
 *
 * Jede Aussage hier muss stimmen (UWG Art. 3 Abs. 1 lit. b). Ein Logo
 * behauptet, dass die Firma zeugnio nutzt; das darf nur stehen, wenn es so ist
 * und die Firma zugestimmt hat.
 */

type PilotLogo = {
  /** Firmenname, wird als Alt-Text vorgelesen. */
  name: string;
  /** Pfad unter public/, z. B. "/logos/muster-ag.svg". */
  src: string;
  /** Eigenmasse der Datei in px, nur für das Seitenverhältnis. */
  width: number;
  height: number;
  /** Optional: Link auf die Website der Firma. */
  href?: string;
};

/*
 * Pilot-Logos. Ein Logo kommt NUR mit schriftlicher Zustimmung des Piloten
 * hierher (E-Mail genügt, ablegen). Ohne Zustimmung verletzt ein Logo
 * Marken- und Lauterkeitsrecht.
 * Dateien nach public/logos/, am besten als SVG oder als PNG mit
 * transparentem Hintergrund. Die Graustufen setzt die Komponente selbst.
 *
 * Beispiel (erfunden):
 *   { name: "Muster AG", src: "/logos/muster-ag.svg", width: 160, height: 40 },
 */
const PILOT_LOGOS: PilotLogo[] = [];

/*
 * Erst nach dem Umzug zu nine einschalten (deploy/nine/cutover-reihenfolge.md,
 * Phase 5 und 6). Heute laufen Vercel (Funktionen in Frankfurt, Middleware
 * weltweit) und Supabase (Frankfurt): Die Aussage wäre vorher falsch.
 * Auch nach dem Umzug bleibt Supabase laut Schritt 6.0 für die Anmeldung im
 * Spiel. Den Wortlaut von SWISS_HOSTING_TEXT darum beim Einschalten gegen
 * RECIPIENTS in app/legal/privacy/page.tsx prüfen.
 */
const SHOW_SWISS_HOSTING: boolean = false;
const SWISS_HOSTING_TEXT =
  "Anwendung und Datenbank laufen auf Servern in der Schweiz";

/* Kleine Zeile über den Logos. Solange die Firmen Piloten sind, sagt
 * «Im Pilotbetrieb bei» genau das; später z. B. «Im Einsatz bei». */
const LOGO_HEADING = "Im Pilotbetrieb bei";

export function TrustStrip() {
  const hasLogos = PILOT_LOGOS.length > 0;
  if (!hasLogos && !SHOW_SWISS_HOSTING) return null;

  return (
    <section
      aria-labelledby={hasLogos ? "trust-strip-heading" : undefined}
      className="border-b border-ink-200 bg-white"
    >
      <div className="container-zx py-10 sm:py-12">
        {hasLogos && (
          <>
            <h2
              id="trust-strip-heading"
              className="text-center text-[12px] font-medium uppercase tracking-[0.18em] text-ink-500"
            >
              {LOGO_HEADING}
            </h2>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
              {PILOT_LOGOS.map((logo) => {
                const img = (
                  <Image
                    src={logo.src}
                    alt={logo.name}
                    width={logo.width}
                    height={logo.height}
                    className="h-7 w-auto max-w-[140px] object-contain sm:h-8"
                  />
                );
                return (
                  <li
                    key={logo.name}
                    className="opacity-60 grayscale transition-opacity duration-200 focus-within:opacity-100 hover:opacity-100 motion-reduce:transition-none"
                  >
                    {logo.href ? (
                      <a
                        href={logo.href}
                        rel="noopener noreferrer"
                        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol-600 focus-visible:ring-offset-4"
                      >
                        {img}
                      </a>
                    ) : (
                      img
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {SHOW_SWISS_HOSTING && (
          <p
            className={`flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-600 ${
              hasLogos ? "mt-8" : ""
            }`}
          >
            <svg
              aria-hidden="true"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="shrink-0 text-petrol-600"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {SWISS_HOSTING_TEXT}
          </p>
        )}
      </div>
    </section>
  );
}
