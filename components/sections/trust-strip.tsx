import Image from "next/image";
import Link from "next/link";
import { ALLES_SCHWEIZ, ANMELDUNG, MAIL } from "@/lib/legal/hosting-phase";

/*
 * Vertrauensstreifen direkt unter dem Hero.
 *
 * Solange PILOT_LOGOS leer ist, zeigt er nur die Zeile zum Speicherort.
 * Sind PILOT_LOGOS leer und SHOW_SWISS_HOSTING false, gibt die Komponente
 * null zurück. Es entsteht kein leerer Abstand.
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
 * Eingeschaltet mit dem Umzug zu nine (deploy/nine/cutover-reihenfolge.md,
 * Schritt 6.0). Vorher liefen Vercel und Supabase in Frankfurt, die Aussage
 * wäre falsch gewesen.
 *
 * Was der Text sagt und warum er so vorsichtig ist:
 *  - «gespeichert in der Schweiz»: Anwendung, Datenbank, Logos und
 *    Sicherungen liegen bei nine im Kanton Zürich. Das stimmt.
 *  - Seit Cutover B (23.11.2026) und B2 liegt auch die Anmeldung (Konten,
 *    Sitzungen, Einmal-Codes) auf advisori01, darum «Zeugnis- und
 *    Anmeldedaten gespeichert». Das Wort «gespeichert» MUSS bleiben.
 *  - Die Einschränkung im zweiten Satz MUSS stehen bleiben: Mails gehen über
 *    Resend (Irland, Metadaten in den USA), und nine hat einen
 *    Notfallzugriff aus Kanada. «Ihre Daten bleiben in der Schweiz» oder
 *    «verarbeitet in der Schweiz» wären darum irreführend (UWG Art. 3
 *    Abs. 1 lit. b; Hub standards/datenschutz.md «Aussagen nach aussen»).
 *  - Kein «nur», «ausschliesslich» oder «alle Daten».
 * Den zweiten Satz erst ändern, wenn der Mailwechsel (6.3) durch ist, und
 * dann nur gegen RECIPIENTS in app/legal/privacy/page.tsx. Auch danach
 * bleiben Kanada und die Postfächer der Empfänger: «verlässt die Schweiz
 * nie» wird nie stimmen.
 */
const SHOW_SWISS_HOSTING: boolean = true;

/*
 * Endzustand (ALLES_SCHWEIZ, Schalter und Bedingungen in
 * lib/legal/hosting-phase.ts): Alle Auftragsbearbeiter des Dienstes sind in
 * der Schweiz, darum darf «gespeichert und verarbeitet» stehen. Auch dann
 * nicht «verlässt die Schweiz nie»: Zugestellte Mails liegen beim
 * Mailanbieter der Empfänger, und unsere Korrespondenz läuft über
 * Microsoft 365.
 */
const OWN_LOGIN = ANMELDUNG === "nine";
const SWISS_HOSTING_TEXT = ALLES_SCHWEIZ
  ? "Zeugnisdaten gespeichert und verarbeitet in der Schweiz."
  : OWN_LOGIN
    ? "Zeugnis- und Anmeldedaten gespeichert in der Schweiz (nine.ch, Zürich)."
    : "Zeugnisdaten gespeichert in der Schweiz (nine.ch, Zürich).";
const SWISS_HOSTING_LIMITS = ALLES_SCHWEIZ
  ? "Hosting, Anmeldung und E-Mail-Versand bei Schweizer Anbietern (nine.ch, mailomat.swiss)."
  : OWN_LOGIN
    ? MAIL === "resend"
      ? "E-Mail-Versand über einen Anbieter in der EU und den USA."
      : "E-Mail-Versand über mailomat.swiss, Notfallzugriff des Hosters aus Kanada."
    : MAIL === "resend"
      ? "Anmeldung und E-Mail-Versand über Anbieter in der EU und den USA."
      : "Anmeldung über einen Anbieter in der EU und den USA.";

/* Kleine Zeile über den Logos. Solange die Firmen Piloten sind, sagt
 * «Im Pilotbetrieb bei» genau das; später z. B. «Im Einsatz bei».
 * Vor diesem Wechsel jedes Logo einzeln bestätigen: laufender Vertrag, und
 * die Zustimmung gilt weiter. */
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
            className={`text-center text-[12.5px] leading-relaxed text-ink-600 ${
              hasLogos ? "mt-8" : ""
            }`}
          >
            <span className="font-medium text-ink-800">
              <svg
                aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="mr-1.5 inline-block align-[-2px] text-petrol-600"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {SWISS_HOSTING_TEXT}
            </span>{" "}
            {SWISS_HOSTING_LIMITS}{" "}
            <Link
              href="/legal/privacy"
              className="underline underline-offset-2 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol-600 focus-visible:ring-offset-2"
            >
              Details
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
