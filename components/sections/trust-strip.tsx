import Image from "next/image";
import Link from "next/link";

/*
 * Vertrauensstreifen direkt unter dem Hero.
 *
 * Seit 20.11.2026 sichtbar mit dem Übergangshinweis zum Umzug
 * (SHOW_MOVE_NOTICE). Sind PILOT_LOGOS leer und beide Schalter false, gibt
 * die Komponente null zurück. Es entsteht kein leerer Abstand.
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
 * Logo sofort entfernen, wenn die Firma zeugnio nicht mehr nutzt (etwa nach
 * dem Pilotende am 31.3.2027 ohne Folgevertrag) oder die Zustimmung
 * widerruft. Sonst behauptet die Seite eine Nutzung, die es nicht mehr gibt.
 * Dateien nach public/logos/, am besten als SVG oder als PNG mit
 * transparentem Hintergrund. Die Graustufen setzt die Komponente selbst (nur aufs Bild, damit der
 * Fokusring des Links petrol-600 bleibt).
 *
 * Beispiel (erfunden):
 *   { name: "Muster AG", src: "/logos/muster-ag.svg", width: 160, height: 40 },
 */
const PILOT_LOGOS: PilotLogo[] = [];

/*
 * Erst nach dem Umzug zu nine einschalten (deploy/nine/cutover-reihenfolge.md,
 * Phase 5 und 6). Heute laufen Vercel (Funktionen in Frankfurt, Middleware
 * weltweit) und Supabase (Frankfurt): Die Aussage wäre vorher falsch.
 * Auch nach dem Umzug bleibt Supabase laut Schritt 6.0 für die Anmeldung
 * zuständig (Konten, E-Mail-Adressen, Sitzungen in Frankfurt). Darum nennt
 * der Text diese Einschränkung ausdrücklich. Ein Satz wie «Ihre Daten bleiben
 * in der Schweiz» wäre irreführend, solange das so ist.
 * Die Einschränkung erst streichen, wenn Supabase Auth abgelöst ist (Cutover B,
 * eigene Anmeldung) und RECIPIENTS in app/legal/privacy/page.tsx Supabase
 * nicht mehr nennt. Beim Einschalten den Text in jedem Fall gegen RECIPIENTS
 * prüfen.
 */
const SHOW_SWISS_HOSTING: boolean = false;
const SWISS_HOSTING_TEXT =
  "Anwendung und Zeugnisdaten laufen auf Servern in der Schweiz, die Anmeldung über Supabase in Frankfurt";

/*
 * Übergangshinweis bis zum Umzug (seit 20.11.2026). Er kündigt nur an und
 * behauptet nichts, was heute schon gilt: Bis zum Umzugsfenster liegen die
 * Daten bei Vercel und Supabase in Frankfurt (RECIPIENTS). Darum kein Häkchen,
 * sondern ein Pfeil, und «ziehen … um» statt «liegen».
 * Am Umzugstag mit PR #88 ausschalten (false) bzw. durch SHOW_SWISS_HOSTING
 * ersetzen. Verschiebt sich das Fenster über Ende November hinaus, den Monat
 * hier, in der FAQ und in app/legal/privacy (Abschnitt 5) nachziehen.
 */
const SHOW_MOVE_NOTICE: boolean = true;
const MOVE_NOTICE_TEXT =
  "Umzug in die Schweiz: Ende November 2026 ziehen Anwendung und Zeugnisdaten zu nine.ch nach Zürich.";

/* Kleine Zeile über den Logos. Solange die Firmen Piloten sind, sagt
 * «Im Pilotbetrieb bei» genau das; später z. B. «Im Einsatz bei».
 * Vor diesem Wechsel jedes Logo einzeln bestätigen: laufender Vertrag, und
 * die Zustimmung gilt weiter. */
const LOGO_HEADING = "Im Pilotbetrieb bei";

/* Wie linkClass in components/sections/faq.tsx, plus sichtbarer Fokusring. */
const LINK_CLASS =
  "rounded-sm font-medium text-petrol-700 underline decoration-petrol-300 underline-offset-2 hover:decoration-petrol-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol-600 focus-visible:ring-offset-2";

export function TrustStrip() {
  const hasLogos = PILOT_LOGOS.length > 0;
  if (!hasLogos && !SHOW_SWISS_HOSTING && !SHOW_MOVE_NOTICE) return null;

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
                    className="h-7 w-auto max-w-[140px] object-contain grayscale sm:h-8"
                  />
                );
                return (
                  <li
                    key={logo.name}
                    className="opacity-60 transition-opacity duration-200 focus-within:opacity-100 hover:opacity-100 motion-reduce:transition-none"
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

        {SHOW_MOVE_NOTICE && !SHOW_SWISS_HOSTING && (
          <p
            className={`text-center text-[12.5px] leading-relaxed text-ink-600 ${
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
              className="mr-1.5 inline-block -translate-y-px align-middle text-petrol-600"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            {MOVE_NOTICE_TEXT}{" "}
            <Link href="/legal/privacy" className={LINK_CLASS}>
              Details
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
