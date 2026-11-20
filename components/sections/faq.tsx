import Link from "next/link";
import type { ReactNode } from "react";
import { RETENTION } from "@/lib/retention";

/*
 * «Häufige Fragen» auf der Startseite, direkt vor dem Schluss-CTA.
 *
 * Aufbau nach Vorbildern auf Mobbin: Kopf links und Fragen rechts wie bei Zaro,
 * Trennlinien mit Plus/Minus wie bei Tines. Farben, Schrift und Texte bleiben
 * die von zeugnio.
 *
 * Technik: native <details>/<summary>. Das Akkordeon funktioniert ohne
 * JavaScript, mit Tastatur (Tab, Enter, Leertaste) und wird von
 * Screenreadern als auf- und zuklappbar angesagt.
 *
 * Jede Antwort ist im Code belegt (UWG Art. 3 Abs. 1 lit. b). Ändert sich
 * eine Quelle, muss die Antwort mit:
 *  - Gültigkeit:      components/marketing/footer.tsx (Hinweis), app/legal/terms Ziffer 5
 *  - Führungskraft:   app/api/certificates/[id]/invite (Token-Link, 14 Tage),
 *                     app/(public)/app/invitations/[token] (keine Anmeldung)
 *  - Satzbausteine:   app/legal/privacy Abschnitt 3, app/api/certificates/[id]/text
 *  - Echtheit:        lib/pdf/certificate.tsx (QR), app/verify (Hinweis zur Verifikation)
 *  - Ändern:          app/api/certificates/[id]/revoke, components/app/certificate-manage.tsx
 *  - Wer sieht was:   app/legal/privacy Abschnitt 3 («Versiegelung»: was die
 *                     Prüfung zeigt), app/(public)/app/signoffs/[token]
 *                     (Unterzeichnende sehen den Zeugnistext)
 *  - Empfänger/Orte:  RECIPIENTS in app/legal/privacy/page.tsx (seit dem Umzug:
 *                     nine in Zürich, Notfallzugriff aus Kanada, Supabase-
 *                     Anmeldung in Frankfurt, Resend über Irland, USA und
 *                     Singapur). Erlaubt: «gespeichert in der Schweiz». KEINE
 *                     Aussage «alles/nur in der Schweiz» oder «verlässt die
 *                     Schweiz nie», solange Supabase Auth und Resend laufen.
 *  - Preise:          components/sections/pricing.tsx, company-package.tsx,
 *                     app/legal/terms Ziffer 4 (kein Streichpreis, PBV Art. 16)
 *  - Export/Löschen:  app/(authed)/app/daten, app/api/companies/[id]/export
 *                     (ZIP nur mit ausgestellten Zeugnissen, Entwürfe nur im CSV),
 *                     lib/retention.ts (registerYears),
 *                     app/api/companies/[id]/delete, app/api/account/delete
 */

type Faq = { q: string; a: ReactNode };

const linkClass =
  "font-medium text-petrol-700 underline decoration-petrol-300 underline-offset-2 hover:decoration-petrol-700";

const faqs: Faq[] = [
  {
    q: "Ist ein Zeugnis aus zeugnio rechtlich gültig?",
    a: (
      <>
        zeugnio ist ein Werkzeug zum Erstellen und bietet keine Rechtsberatung.
        Aussteller bleibt Ihre Firma: Die Verantwortung für Wahrheit,
        Vollständigkeit und arbeitsrechtliche Zulässigkeit des Inhalts liegt
        beim Arbeitgeber. Die gesetzliche Grundlage für das Arbeitszeugnis ist
        Art. 330a OR.
      </>
    ),
  },
  {
    q: "Braucht die Führungskraft ein Konto?",
    a: (
      <>
        Nein. Die Führungskraft erhält per E-Mail einen persönlichen Link zum
        Beurteilungsformular und muss sich dafür nicht anmelden. Der Link ist 14
        Tage gültig. Ist er abgelaufen, senden Sie einfach eine neue Einladung.
      </>
    ),
  },
  {
    q: "Schreibt eine künstliche Intelligenz das Zeugnis?",
    a: (
      <>
        Nein. Der Zeugnistext entsteht aus Satzbausteinen, passend zur
        Beurteilung der Führungskraft. Eine künstliche Intelligenz setzen wir
        dafür nicht ein. Vor dem Finalisieren können Sie den Text noch von Hand
        anpassen.
      </>
    ),
  },
  {
    q: "Wie funktioniert die Echtheitsprüfung?",
    a: (
      <>
        Beim Finalisieren berechnet zeugnio aus dem Zeugnis einen digitalen
        Fingerabdruck (Hash) und registriert ihn. Wer das PDF auf{" "}
        <Link href="/verify" className={linkClass}>
          zeugnio.ch/verify
        </Link>{" "}
        hochlädt, sieht, ob der Text mit dem registrierten Original
        übereinstimmt. Ein QR-Code auf dem Zeugnis zeigt nur, dass es
        registriert ist. Ob ein vorliegendes Dokument denselben Text trägt,
        belegt erst das Hochladen.
      </>
    ),
  },
  {
    q: "Was passiert, wenn ein finalisiertes Zeugnis geändert werden muss?",
    a: (
      <>
        Ein finalisiertes Zeugnis ist versiegelt und lässt sich nicht mehr
        bearbeiten. Sie erstellen dann ein neues Zeugnis. Das alte kann
        widerrufen, wer im Team versiegeln darf. Die Prüfung zeigt es danach
        dauerhaft als widerrufen an.
      </>
    ),
  },
  {
    q: "Wer sieht die Daten, und wo werden sie verarbeitet?",
    a: (
      <>
        Zeugnisdaten sehen die Personen Ihres Teams mit Zugriff, die eingeladene
        Führungskraft und die Unterzeichnenden. Wer ein ausgestelltes Zeugnis
        prüft, sieht Status, Name, Arbeitgeber, Titel, Datum und
        Unterzeichnende. Anwendung, Datenbank und Firmenlogos liegen auf einem
        Server von nine.ch in Zürich, die Sicherungen in einem zweiten
        Rechenzentrum im Kanton Zürich. Im Notfall kann nine auch aus Kanada auf
        den Server zugreifen. Die Anmeldung läuft vorerst über Supabase in
        Frankfurt; dort liegen die E-Mail-Adressen der Benutzerkonten und die
        Anmeldesitzungen. E-Mails wie Anmeldelinks und Einladungen verschickt
        Resend über Irland. Betriebsprotokolle, Support und E-Mail-Metadaten
        dieser beiden Anbieter können ausserhalb der EU bearbeitet werden,
        namentlich in den USA und in Singapur. Alle Einzelheiten stehen in der{" "}
        <Link href="/legal/privacy" className={linkClass}>
          Datenschutzerklärung
        </Link>
        .
      </>
    ),
  },
  {
    q: "Was kostet zeugnio nach der Beta?",
    a: (
      <>
        Das Erstellen von Zeugnissen ist kostenlos und bleibt es. Echtheit
        prüfen, Zeugnisanalyse und Premium-Prüfung sind während der Beta
        kostenlos, danach kosten sie regulär CHF 19.90, CHF 29.90 und CHF 39.90.
        Den Wechsel kündigen wir vorher an. Ein Firmenpaket für viele Prüfungen
        ist in Planung, siehe{" "}
        <Link href="/pricing" className={linkClass}>
          Preise
        </Link>
        .
      </>
    ),
  },
  {
    q: "Kann ich meine Daten exportieren und löschen?",
    a: (
      <>
        Ja, auf der Seite «Daten» in der App. Je nach Rolle laden Sie dort alle
        ausgestellten Zeugnisse einer Firma als ZIP herunter (als PDF und als
        Word-Datei, dazu Stammdaten als CSV) und löschen Mitarbeitende, Firmen
        oder Ihr eigenes Konto. Ausgestellte Zeugnisse bleiben danach{" "}
        {RETENTION.registerYears} Jahre prüfbar: zeugnio behält dafür nur
        Prüfwert, Status, Arbeitgeber und Datum, keine Namen und keinen Text.
      </>
    ),
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="scroll-mt-20 border-b border-ink-200 bg-ink-50/40 py-24"
    >
      <div className="container-zx">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="eyebrow">Häufige Fragen</div>
              <h2
                id="faq-title"
                className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]"
              >
                Kurz gefragt.
                <br />
                <span className="font-display italic text-petrol-700">
                  Klar beantwortet.
                </span>
              </h2>
              <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink-600">
                Was Arbeitgeber, HR und Führungskräfte vor dem ersten Zeugnis
                wissen möchten. Ihre Frage fehlt?{" "}
                <Link href="/contact" className={linkClass}>
                  Schreiben Sie uns
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <ul className="border-t border-ink-200">
              {faqs.map((f) => (
                <li key={f.q} className="border-b border-ink-200">
                  <details className="group">
                    <summary className="group/q flex cursor-pointer list-none items-start justify-between gap-6 rounded-md py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol-600 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 [&::-webkit-details-marker]:hidden">
                      <span className="text-[15.5px] font-medium leading-snug tracking-tight text-ink-900 transition-colors group-hover/q:text-petrol-700 motion-reduce:transition-none sm:text-[16px]">
                        {f.q}
                      </span>
                      <PlusMinus />
                    </summary>
                    <div className="max-w-2xl pb-6 pr-12 text-[14.5px] leading-relaxed text-ink-600">
                      {f.a}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Plus im Kreis, wird beim Öffnen zum Minus (senkrechter Strich klappt weg). */
function PlusMinus() {
  return (
    <span
      aria-hidden="true"
      className="relative mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-ink-700 ring-1 ring-inset ring-ink-200 transition-colors group-open:bg-petrol-700 group-open:text-white group-open:ring-petrol-700 motion-reduce:transition-none"
    >
      <span className="absolute h-[1.5px] w-3 rounded-full bg-current" />
      <span className="absolute h-3 w-[1.5px] rounded-full bg-current transition-transform duration-200 group-open:scale-y-0 motion-reduce:transition-none" />
    </span>
  );
}
