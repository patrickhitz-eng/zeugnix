import { LegalContent } from "@/components/marketing/legal-content";
import { companyInfo } from "@/lib/legal/company-info";
import { siteConfig } from "@/lib/site-config";

export const metadata = { title: "Datenschutz" };

// Vor der Veröffentlichung als «geprüft» juristisch prüfen lassen (Fahrplan
// Marktstart, Schritt 9). Abschnitt 5 und Anhang 3 des
// Auftragsbearbeitungsvertrags müssen dieselben Anbieter nennen.

/**
 * Empfänger von Personendaten (Abschnitt 5), Stand vor dem Umzug zu nine.
 * Beim Umzug fällt Vercel weg und Supabase bleibt nur für die Anmeldung;
 * mit dem Mailwechsel ersetzt mailomat.swiss Resend.
 */
const RECIPIENTS: { name: string; task: string; location: string; basis: string }[] = [
  {
    name: "Vercel Inc., USA",
    task: "Hosting der Website",
    location:
      "Server-Funktionen in Frankfurt (Deutschland). Seiten und die Prüfung der Anmeldesitzung liefert Vercel über ein weltweites Netz aus",
    basis: "Zertifizierung im Data Privacy Framework (EU-US und Swiss-US)",
  },
  {
    name: "Supabase Pte. Ltd, Singapur (Supabase-Gruppe, USA)",
    task: "Datenbank, Anmeldung und Dateien (Firmenlogos)",
    location:
      "Daten, Sicherungen und Anmeldung in Frankfurt (Deutschland). Betriebsprotokolle und Support können ausserhalb der EU bearbeitet werden, namentlich in den USA und in Singapur",
    basis: "Standardvertragsklauseln der EU-Kommission mit Schweizer Ergänzung",
  },
  {
    name: "Resend (Plus Five Five, Inc.), USA",
    task: "Versand von E-Mails (Anmeldelinks, Einladungen, Freigaben) und Empfang von E-Mails an Adressen @zeugnio.ch",
    location:
      "Versand und Empfang über Amazon Web Services in Irland. Kontodaten, Versandprotokolle und Metadaten speichert Resend in den USA, Protokolle während 30 Tagen",
    basis: "Standardvertragsklauseln der EU-Kommission mit Bestimmungen für Bekanntgaben aus der Schweiz",
  },
];

export default function Page() {
  return (
    <LegalContent
      title="Datenschutzerklärung"
      updated="28. Oktober 2026"
      intro={
        <>
          Diese Erklärung informiert nach dem Schweizer Datenschutzgesetz (DSG)
          und, soweit anwendbar, nach der Datenschutz-Grundverordnung der EU
          (DSGVO) darüber, welche Personendaten {siteConfig.name} bei der
          Nutzung von {siteConfig.domain} bearbeitet.
        </>
      }
      sections={[
        {
          heading: "1. Verantwortlicher und Rollen",
          body: (
            <>
              <p>
                {companyInfo.legalName}, {companyInfo.address.street},{" "}
                {companyInfo.address.zipCity}. Kontakt für
                Datenschutzanfragen:{" "}
                <a href={`mailto:${companyInfo.contactEmail}`} className="underline">
                  {companyInfo.contactEmail}
                </a>
                .
              </p>
              <p>
                Für Benutzerkonten, die Website und Prüfungen auf{" "}
                {siteConfig.domain}/verify sind wir verantwortlich. Für die
                Zeugnisdaten, die ein Arbeitgeber erfasst (Mitarbeitende,
                Beurteilungen, Unterzeichnende), ist dieser Arbeitgeber
                verantwortlich. Wir bearbeiten sie in seinem Auftrag und
                gestützt auf einen Auftragsbearbeitungsvertrag. Fragen zu
                diesen Daten richten Sie am besten zuerst an Ihren Arbeitgeber;
                Anfragen an uns leiten wir ihm weiter.
              </p>
            </>
          ),
        },
        {
          heading: "2. Welche Daten wir bearbeiten",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="font-medium text-ink-800">Konto:</strong>{" "}
                E-Mail-Adresse, Name, Rolle in der Firma sowie Fassung und
                Zeitpunkt der angenommenen AGB. Die Anmeldung erfolgt ohne
                Passwort per Einmal-Link oder Code.
              </li>
              <li>
                <strong className="font-medium text-ink-800">
                  Zeugnisdaten (im Auftrag des Arbeitgebers):
                </strong>{" "}
                zur Person, für die ein Zeugnis entsteht, Name, Geschlecht für
                die Anrede, Geburtsdatum, Funktion, Abteilung, Ein- und
                Austrittsdatum, Aufgaben, Austrittsgrund, Beurteilung von
                Leistung und Verhalten sowie der Zeugnistext; zu Vorgesetzten
                Name, E-Mail-Adresse und Beurteilung; zu Unterzeichnenden Name,
                Funktion, E-Mail-Adresse sowie Zeitpunkt, IP-Adresse und
                Browserkennung der Freigabe.
              </li>
              <li>
                <strong className="font-medium text-ink-800">
                  Versiegelung:
                </strong>{" "}
                kryptografischer Hash und Signatur des finalisierten Zeugnisses,
                Ausstellungsdatum und Status. Dieser Registereintrag macht das
                Zeugnis prüfbar.
              </li>
              <li>
                <strong className="font-medium text-ink-800">
                  Prüfung und Analyse:
                </strong>{" "}
                Den Text eines hochgeladenen Zeugnisses verarbeiten wir nur für
                die Dauer der Prüfung. Gespeichert werden der Hash und das
                Ergebnis, nicht der Text.
              </li>
              <li>
                <strong className="font-medium text-ink-800">
                  Technische Daten:
                </strong>{" "}
                Zur Abwehr von Missbrauch zählen wir Anfragen pro IP-Adresse;
                diese Zähler löschen wir in der Regel nach einer Stunde. Unser
                Hosting-Anbieter protokolliert Aufrufe technisch. Unsere eigenen
                Protokolle enthalten keine E-Mail- oder IP-Adressen.
              </li>
            </ul>
          ),
        },
        {
          heading: "3. Zweck der Bearbeitung",
          body: (
            <p>
              Wir bearbeiten diese Daten, um Arbeitszeugnisse erstellen,
              beurteilen, versiegeln und prüfen zu lassen, um den Zugang zu
              Konten zu sichern, um mit Ihnen zu kommunizieren (Anmeldelinks,
              Einladungen, Freigaben) und um Missbrauch abzuwehren. Texte
              entstehen aus Satzbausteinen. Wir setzen dafür keine künstliche
              Intelligenz ein und nutzen Ihre Daten nicht für Werbung.
            </p>
          ),
        },
        {
          heading: "4. Rechtsgrundlage",
          body: (
            <p>
              Soweit die DSGVO anwendbar ist, stützen wir die Bearbeitung auf
              die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO),
              für Sicherheit und Missbrauchsabwehr auf unser berechtigtes
              Interesse (lit. f) und für Aufbewahrungspflichten auf das Gesetz
              (lit. c). Zeugnisdaten bearbeiten wir im Auftrag des
              Arbeitgebers; die Rechtsgrundlage dafür liegt bei ihm.
            </p>
          ),
        },
        {
          heading: "5. Empfänger und Bekanntgabe ins Ausland",
          body: (
            <>
              <p>
                Wir setzen folgende Dienstleister als Auftragsbearbeiter ein.
                Jeder ist über seinen Datenbearbeitungsvertrag an uns gebunden.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                {RECIPIENTS.map((r) => (
                  <li key={r.name}>
                    <strong className="font-medium text-ink-800">{r.name}</strong>{" "}
                    – {r.task}. {r.location}. Grundlage für die Bekanntgabe
                    ausserhalb der Schweiz und des EWR: {r.basis}.
                  </li>
                ))}
              </ul>
              <p>
                E-Mails an {companyInfo.contactEmail} bearbeiten wir in
                Microsoft 365.
              </p>
            </>
          ),
        },
        {
          heading: "6. Aufbewahrungsdauer",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Kontodaten, bis das Konto gelöscht wird. Die Löschung nehmen wir
                auf Anfrage vor.
              </li>
              <li>
                Zeugnisdaten, solange der Arbeitgeber {siteConfig.name} nutzt.
                Danach löschen wir sie nach dem Auftragsbearbeitungsvertrag.
              </li>
              <li>
                Den Registereintrag eines finalisierten Zeugnisses bewahren wir
                auch danach auf, damit das Zeugnis prüfbar bleibt. Die Dauer
                vereinbaren wir mit dem Arbeitgeber.
              </li>
              <li>
                Einladungs- und Freigabelinks laufen nach 14 Tagen ab.
              </li>
            </ul>
          ),
        },
        {
          heading: "7. Cookies",
          body: (
            <p>
              Wir setzen ausschliesslich technisch notwendige Cookies für die
              Anmeldesitzung ein. Es gibt kein Tracking und keine Analyse Ihres
              Nutzungsverhaltens durch Dritte. Schriften und Skripte laden wir
              vom eigenen Server. Für diese Cookies ist keine Einwilligung
              erforderlich.
            </p>
          ),
        },
        {
          heading: "8. Ihre Rechte",
          body: (
            <>
              <p>
                Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
                Herausgabe Ihrer Personendaten sowie das Recht, einer
                Bearbeitung zu widersprechen, soweit das Gesetz dies vorsieht.
                Kontaktieren Sie uns dazu unter{" "}
                <a href={`mailto:${companyInfo.contactEmail}`} className="underline">
                  {companyInfo.contactEmail}
                </a>
                .
              </p>
              <p>
                Sie können sich beim Eidgenössischen Datenschutz- und
                Öffentlichkeitsbeauftragten (EDÖB) beschweren. Gilt für Sie die
                DSGVO, steht Ihnen auch die Aufsichtsbehörde Ihres Landes offen.
              </p>
            </>
          ),
        },
        {
          heading: "9. Datensicherheit",
          body: (
            <p>
              Die Übertragung erfolgt verschlüsselt (TLS). Jede Firma sieht in
              der Datenbank nur ihre eigenen Daten. Finalisierte Zeugnisse
              werden mit einem SHA-256-Hash und einer Signatur versiegelt und
              lassen sich danach nicht mehr verändern.
            </p>
          ),
        },
        {
          heading: "10. Änderungen dieser Erklärung",
          body: (
            <p>
              Wir passen diese Datenschutzerklärung an, wenn sich die
              Datenbearbeitung oder die Rechtslage ändert. Massgeblich ist
              jeweils die aktuell auf {siteConfig.domain} publizierte Fassung.
            </p>
          ),
        },
      ]}
    />
  );
}
