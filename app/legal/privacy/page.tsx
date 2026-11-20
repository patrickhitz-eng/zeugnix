import { LegalContent } from "@/components/marketing/legal-content";
import { companyInfo } from "@/lib/legal/company-info";
import { siteConfig } from "@/lib/site-config";
import { RETENTION } from "@/lib/retention";
import { HOSTING_PHASE } from "@/lib/legal/hosting-phase";

export const metadata = { title: "Datenschutz" };

// Vor der Veröffentlichung als «geprüft» juristisch prüfen lassen (Fahrplan
// Marktstart, Schritt 9). Abschnitt 5 und Anhang 3 des
// Auftragsbearbeitungsvertrags müssen dieselben Anbieter nennen.
//
// Aufbau nach den Informationspflichten von Art. 19–21 DSG und, wo die DSGVO
// gilt, Art. 13/14 DSGVO: Verantwortlicher, Daten, Zwecke, Grundlagen,
// Empfänger mit Staaten und Garantien, Fristen, Rechte, automatisierte
// Entscheide. Jede Aussage muss dem Ist-Zustand entsprechen. Wer etwas am
// Betrieb ändert (Anbieter, Fristen, Protokolle), ändert es hier mit.

/**
 * Stand-Datum der Erklärung. ⚠ Geplanter Umzugstag (Cutover A, Fenster
 * Do 26.11.2026). BEIM MERGE auf den Tag setzen, an dem zeugnio.ch wirklich
 * von advisori01 ausgeliefert wird (cutover-reihenfolge.md 6.0). Verschiebt
 * sich das Fenster, wandert dieses Datum mit.
 */
const UPDATED = "26. November 2026";

/**
 * Empfänger von Personendaten (Abschnitt 5). Welche Liste gilt, entscheidet
 * HOSTING_PHASE in lib/legal/hosting-phase.ts (dort die Bedingungen für den
 * Wechsel). Jede Liste muss mit Anhang 3 des Auftragsbearbeitungsvertrags
 * übereinstimmen.
 *
 * basis = null heisst: Der Anbieter bearbeitet die Daten nur in der Schweiz,
 * es gibt keine Bekanntgabe ins Ausland.
 *
 * Standorte Altstetten (Server) und Rümlang (Sicherungen): von Silvan am
 * 20.11.2026 bestätigt. Die Kopie der Daten bei Supabase wird nach dem Umzug
 * gelöscht (Entscheid Silvan 20.11.2026); darum nennt keine Liste sie.
 */
type Recipient = { name: string; task: string; location: string; basis: string | null };

/**
 * Endzustand: nur Schweizer Anbieter. Cloudflare wird ausdrücklich verneint,
 * weil der Hub die Nennung verlangt (standards/datenschutz.md) und nines AVV
 * Cloudflare nur bei Buchung vorsieht.
 */
const RECIPIENTS_SCHWEIZ: Recipient[] = [
  {
    name: "Nine Internet Solutions AG, Zürich",
    task: "Hosting der Anwendung, der Anmeldung, der Datenbank und der Firmenlogos auf einem verwalteten Server",
    location:
      "Server im Rechenzentrum Zürich-Altstetten, verschlüsselte Sicherungen in einem zweiten Rechenzentrum in Rümlang (beide Schweiz). Den Zugriff von Gesellschaften der nine-Gruppe ausserhalb der Schweiz haben wir ausgeschlossen. Dienste, für die nine Unterauftragsbearbeiter ausserhalb der Schweiz beizieht (etwa Cloudflare), nutzen wir nicht",
    basis: null,
  },
  {
    name: "mailXpert GmbH, Zürich (mailomat.swiss)",
    task: "Versand von E-Mails (Anmeldecodes, Einladungen, Freigaben)",
    location: "Versand und Protokolle in der Schweiz",
    basis: null,
  },
];

/**
 * Übergang nach dem Umzug zu nine (Cutover A): Supabase nur noch für die
 * Anmeldung, Resend bis zum Mailwechsel (6.3). Cloudflare mit Vorbehalt, siehe
 * oben.
 */
const RECIPIENTS_UEBERGANG: Recipient[] = [
  {
    name: "Nine Internet Solutions AG, Zürich",
    task: "Hosting der Anwendung, der Datenbank und der Firmenlogos auf einem verwalteten Server",
    location:
      "Server im Rechenzentrum Zürich-Altstetten, verschlüsselte Sicherungen in einem zweiten Rechenzentrum in Rümlang (beide Schweiz). Für Notfälle und Wartung ausserhalb der Bürozeiten kann die Tochtergesellschaft Nine Internet Solutions Ltd. aus Kanada auf den Server zugreifen; sie speichert dort keine Daten. Für Netz- und DDoS-Schutz führt nine zudem Cloudflare, Inc. (USA) als Unterauftragsbearbeiter, soweit dieser Dienst eingesetzt wird",
    basis:
      "für den Zugriff aus Kanada die Feststellung des Bundesrats, dass Kanada einen angemessenen Datenschutz gewährleistet (Anhang 1 der Datenschutzverordnung); für Cloudflare die Garantien im Auftragsbearbeitungsvertrag von nine (Standardvertragsklauseln, soweit anwendbar)",
  },
  {
    name: "Supabase Pte. Ltd, Singapur (Supabase-Gruppe, USA)",
    task: "Anmeldung: Benutzerkonten mit E-Mail-Adresse, Anmeldesitzungen und Einmal-Codes",
    location:
      "Anmeldung in Frankfurt (Deutschland). Betriebsprotokolle und Support können ausserhalb der EU bearbeitet werden, namentlich in den USA und in Singapur",
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

/**
 * Nicht Teil des Dienstes, aber Empfänger: unsere eigene Korrespondenz. Kein
 * Unterauftragsbearbeiter für Zeugnisdaten, gehört darum NICHT in Anhang 3
 * des Auftragsbearbeitungsvertrags. Gilt in beiden Phasen.
 */
const CORRESPONDENCE: Recipient = {
  name: "Microsoft Ireland Operations Ltd, Irland (Microsoft-Gruppe, USA)",
  task: `Microsoft 365 für E-Mails an ${companyInfo.contactEmail} und unsere übrige Korrespondenz`,
  location:
    "Microsoft kann diese Daten auch ausserhalb der Schweiz bearbeiten, namentlich in der EU und in den USA",
  basis:
    "Standardvertragsklauseln der EU-Kommission und die Zertifizierung von Microsoft im Data Privacy Framework (EU-US und Swiss-US)",
};

const SWISS_ONLY = HOSTING_PHASE === "schweiz";
const RECIPIENTS = SWISS_ONLY ? RECIPIENTS_SCHWEIZ : RECIPIENTS_UEBERGANG;

function RecipientItem({ r }: { r: Recipient }) {
  return (
    <li>
      <strong className="font-medium text-ink-800">{r.name}</strong> – {r.task}.{" "}
      {r.location}.{" "}
      {r.basis
        ? `Grundlage für die Bekanntgabe ausserhalb der Schweiz und des EWR: ${r.basis}.`
        : "Keine Bekanntgabe ins Ausland."}
    </li>
  );
}

const strong = "font-medium text-ink-800";

export default function Page() {
  const mail = (
    <a href={`mailto:${companyInfo.contactEmail}`} className="underline">
      {companyInfo.contactEmail}
    </a>
  );

  return (
    <LegalContent
      title="Datenschutzerklärung"
      updated={UPDATED}
      intro={
        <>
          Diese Erklärung informiert nach dem Schweizer Datenschutzgesetz (DSG)
          und, soweit anwendbar, nach der Datenschutz-Grundverordnung der EU
          (DSGVO) darüber, welche Personendaten {siteConfig.name} bei der
          Nutzung von {siteConfig.domain} bearbeitet, wozu, wo und wie lange.
          Für Zeugnisdaten, die ein Arbeitgeber erfasst, gilt zusätzlich seine
          eigene Datenschutzerklärung. Abschnitt 11 erklärt, wie wir Firmen auf{" "}
          {siteConfig.name} aufmerksam machen.
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
                Datenschutzanfragen: {mail}.
              </p>
              <p>
                Für Benutzerkonten, die Website und Prüfungen auf{" "}
                {siteConfig.domain}/verify sind wir verantwortlich. Für die
                Zeugnisdaten, die ein Arbeitgeber erfasst (Mitarbeitende,
                Beurteilungen, Unterzeichnende), ist dieser Arbeitgeber
                verantwortlich. Wir bearbeiten sie in seinem Auftrag, nur nach
                seinen Weisungen und gestützt auf einen
                Auftragsbearbeitungsvertrag. Fragen zu diesen Daten richten Sie
                am besten zuerst an Ihren Arbeitgeber; Anfragen an uns leiten
                wir ihm weiter.
              </p>
            </>
          ),
        },
        {
          heading: "2. Welche Daten wir bearbeiten",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className={strong}>Konto:</strong> E-Mail-Adresse,
                Name, Rolle in der Firma sowie Fassung und Zeitpunkt der
                angenommenen AGB. Die Anmeldung erfolgt ohne Passwort per
                Einmal-Link oder Code.
              </li>
              <li>
                <strong className={strong}>
                  Zeugnisdaten (im Auftrag des Arbeitgebers):
                </strong>{" "}
                zur Person, für die ein Zeugnis entsteht, Name, Geschlecht für
                die Anrede, Geburtsdatum, Funktion, Abteilung, Ein- und
                Austrittsdatum, Aufgaben, Austrittsgrund, Beurteilung von
                Leistung und Verhalten sowie der Zeugnistext; zu Vorgesetzten
                Name, E-Mail-Adresse und Beurteilung; zu Unterzeichnenden Name,
                Funktion, E-Mail-Adresse sowie Zeitpunkt, IP-Adresse und
                Browserkennung der Freigabe. {siteConfig.name} fragt keine
                besonders schützenswerten Personendaten ab, etwa zur
                Gesundheit. Wer solche Angaben in ein Freitextfeld schreibt,
                tut das in der Verantwortung des Arbeitgebers.
              </li>
              <li>
                <strong className={strong}>Versiegelung:</strong>{" "}
                kryptografischer Hash und Signatur des finalisierten Zeugnisses,
                Ausstellungsdatum und Status. Dieser Registereintrag macht das
                Zeugnis prüfbar: Wer den QR-Code auf dem Zeugnis scannt oder das
                PDF auf der Prüfseite hochlädt, sieht Status, Name der
                Mitarbeiterin oder des Mitarbeiters, Arbeitgeber, Dokumenttitel,
                Ausstellungsdatum und Unterzeichnende.
              </li>
              <li>
                <strong className={strong}>Prüfung und Analyse:</strong> Den
                Text eines hochgeladenen Zeugnisses verarbeiten wir nur für die
                Dauer der Prüfung. Gespeichert werden der Hash und das Ergebnis,
                nicht der Text.
              </li>
              <li>
                <strong className={strong}>Kommunikation:</strong> Wenn Sie uns
                schreiben, bearbeiten wir Ihre Angaben und den Inhalt Ihrer
                Nachricht, um sie zu beantworten.
              </li>
              <li>
                <strong className={strong}>Technische Daten:</strong> Zur Abwehr
                von Missbrauch zählen wir Anfragen pro IP-Adresse; diese Zähler
                löschen wir in der Regel nach einer Stunde. Der Webserver bei
                unserem Hosting-Anbieter protokolliert Aufrufe technisch, mit
                IP-Adresse, Zeitpunkt, aufgerufener Adresse und Browserkennung.
                Unsere Anwendung entfernt in ihren eigenen Protokollen
                E-Mail-Adressen und Anmeldetokens und kürzt IP-Adressen.
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
              Einladungen, Freigaben, Anfragen), um Missbrauch abzuwehren, um
              gesetzliche Pflichten zu erfüllen und um unsere Rechte zu wahren.
              Texte entstehen aus Satzbausteinen. Wir setzen dafür keine
              künstliche Intelligenz ein. Daten aus Konten, Zeugnissen und
              Prüfungen nutzen wir nicht für Werbung und verkaufen sie nicht.
            </p>
          ),
        },
        {
          heading: "4. Rechtsgrundlage",
          body: (
            <>
              <p>
                Wir bearbeiten Personendaten nach den Grundsätzen des DSG
                (Art. 6 DSG). Wo das DSG eine Rechtfertigung verlangt, stützen
                wir uns auf den Nutzungsvertrag, auf unser überwiegendes
                Interesse an Sicherheit und Missbrauchsabwehr oder auf das
                Gesetz (Art. 31 DSG).
              </p>
              <p>
                Soweit die DSGVO anwendbar ist, stützen wir die Bearbeitung auf
                die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO),
                für Sicherheit, Missbrauchsabwehr und die Wahrung unserer Rechte
                auf unser berechtigtes Interesse (lit. f) und für
                Aufbewahrungspflichten auf das Gesetz (lit. c). Zeugnisdaten
                bearbeiten wir im Auftrag des Arbeitgebers; die Rechtsgrundlage
                dafür liegt bei ihm.
              </p>
              <p>
                Ohne E-Mail-Adresse können wir kein Konto eröffnen und keine
                Anmeldelinks schicken. Die übrigen Angaben brauchen wir, soweit
                die jeweilige Funktion sie verlangt.
              </p>
            </>
          ),
        },
        {
          heading: "5. Empfänger und Bekanntgabe ins Ausland",
          body: (
            <>
              <p>
                {SWISS_ONLY
                  ? "Die Anwendung, die Anmeldung, die Datenbank mit den Konto- und Zeugnisdaten, die Firmenlogos und der E-Mail-Versand laufen bei Anbietern in der Schweiz."
                  : "Die Anwendung, die Datenbank mit den Konto- und Zeugnisdaten und die Firmenlogos liegen auf einem Server in der Schweiz."}{" "}
                Für den Betrieb von {siteConfig.name} setzen wir folgende
                Dienstleister als Auftragsbearbeiter ein. Jeder ist über seinen
                Datenbearbeitungsvertrag an uns gebunden.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                {RECIPIENTS.map((r) => (
                  <RecipientItem key={r.name} r={r} />
                ))}
              </ul>
              <p>Für unsere eigene Korrespondenz nutzen wir:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <RecipientItem r={CORRESPONDENCE} />
              </ul>
              <p>
                {SWISS_ONLY
                  ? `Für den Betrieb von ${siteConfig.name} geben wir damit keine Personendaten ins Ausland bekannt. Schreiben Sie uns eine E-Mail, kann Microsoft sie auch in der EU und in den USA bearbeiten.`
                  : "Personendaten können damit in folgende Staaten gelangen: Deutschland, Irland und weitere Staaten der EU, Kanada, die USA und Singapur."}
              </p>
              <p>
                Eine E-Mail, die wir zustellen, liegt danach beim Mailanbieter
                der Empfängerin oder des Empfängers, worauf wir keinen Einfluss
                haben. Darum nennen unsere Einladungen den Namen der Person, um
                deren Zeugnis es geht, nicht; er erscheint erst nach dem Klick
                auf {siteConfig.domain}.
              </p>
              <p>
                Daneben geben wir Personendaten nur weiter, wenn uns ein Gesetz,
                eine Behörde oder ein Gericht dazu verpflichtet oder wenn es zur
                Wahrung unserer Rechte nötig ist.
              </p>
            </>
          ),
        },
        {
          heading: "6. Aufbewahrungsdauer",
          body: (
            <>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Kontodaten, bis das Konto gelöscht wird. Sie löschen Ihr
                  Konto jederzeit selbst in der App unter «Daten» oder
                  verlangen die Löschung bei uns.
                </li>
                <li>
                  Zeugnisdaten, solange der Arbeitgeber {siteConfig.name}{" "}
                  nutzt. Danach löschen wir sie nach dem
                  Auftragsbearbeitungsvertrag.
                </li>
                <li>
                  IP-Adresse und Browserkennung einer Freigabe durch
                  Unterzeichnende löschen wir nach{" "}
                  {RETENTION.signoffEvidenceDays} Tagen.
                </li>
                <li>
                  Den Registereintrag eines finalisierten Zeugnisses bewahren
                  wir auch danach auf, damit das Zeugnis prüfbar bleibt, und
                  zwar {RETENTION.registerYears} Jahre ab Ausstellung. Er
                  enthält nur Prüfwerte, Status, Daten, Arbeitgeber und
                  Dokumenttitel, keine Angaben zur Mitarbeiterin oder zum
                  Mitarbeiter und keinen Zeugnistext.
                </li>
                <li>
                  Angaben aus Prüfungen und Analysen, die über Hash und Ergebnis
                  hinausgehen, löscht ein täglicher Lauf spätestens nach{" "}
                  {RETENTION.verifyUploadsDays} Tagen.
                </li>
                <li>
                  Einladungs- und Freigabelinks laufen nach 14 Tagen ab.
                </li>
                <li>
                  Die Protokolle unserer Anwendung löschen wir nach 14 Tagen.
                </li>
              </ul>
              <p>
                Gelöschte Daten verschwinden aus unseren Sicherungen, sobald
                diese turnusgemäss überschrieben werden. Länger bewahren wir
                Daten nur auf, wenn ein Gesetz es verlangt oder wir sie zur
                Wahrung unserer Rechte brauchen, und nur so lange wie nötig.
              </p>
            </>
          ),
        },
        {
          heading: "7. Cookies",
          body: (
            <p>
              Wir setzen ausschliesslich technisch notwendige Cookies für die
              Anmeldesitzung ein. Es gibt keine Werbe- oder Analysecookies, kein
              Tracking und keine Analyse Ihres Nutzungsverhaltens durch Dritte.
              Schriften und Skripte laden wir vom eigenen Server. Für diese
              Cookies ist keine Einwilligung erforderlich.
            </p>
          ),
        },
        {
          heading: "8. Ihre Rechte",
          body: (
            <>
              <p>
                Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
                Herausgabe oder Übertragung Ihrer Personendaten sowie das Recht,
                einer Bearbeitung zu widersprechen. Gilt für Sie die DSGVO,
                können Sie zudem die Einschränkung der Bearbeitung verlangen.
                Kontaktieren Sie uns dazu unter {mail}. Ihr Konto können Sie
                in der App unter «Daten» auch selbst löschen, Firmendaten dort
                exportieren.
              </p>
              <p>
                Damit wir keine Daten an Unbefugte geben, können wir einen
                Nachweis Ihrer Identität verlangen. Wir antworten in der Regel
                innerhalb von 30 Tagen und grundsätzlich kostenlos. Ihre Rechte
                gelten im Rahmen des Gesetzes; wir dürfen sie einschränken, wo
                es das Gesetz erlaubt, etwa zum Schutz Dritter (Art. 26 DSG).
                Betrifft Ihre Anfrage Zeugnisdaten, leiten wir sie dem
                Arbeitgeber weiter, der über sie entscheidet.
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
            <>
              <p>
                Die Übertragung erfolgt verschlüsselt (TLS). Jede Firma sieht in
                der Datenbank nur ihre eigenen Daten. Finalisierte Zeugnisse
                werden mit einem SHA-256-Hash und einer Signatur versiegelt und
                lassen sich danach nicht mehr verändern. Sicherungen der
                Datenbank liegen verschlüsselt in einem zweiten Rechenzentrum in
                der Schweiz.
              </p>
              <p>
                Vollständige Sicherheit kann niemand garantieren. Kommt es
                dennoch zu einer Verletzung der Datensicherheit, melden wir sie,
                wo das Gesetz es verlangt, dem EDÖB, informieren betroffene
                Personen und bei Zeugnisdaten den Arbeitgeber.
              </p>
            </>
          ),
        },
        {
          heading: "10. Keine automatisierten Einzelentscheide",
          body: (
            <p>
              Wir treffen keine automatisierten Einzelentscheidungen im Sinne
              von Art. 21 DSG und Art. 22 DSGVO und betreiben kein Profiling.
              Der Zeugnistext entsteht aus Satzbausteinen, die den Beurteilungen
              der Führungskraft entsprechen. Der Arbeitgeber prüft ihn und gibt
              ihn frei, bevor er versiegelt wird.
            </p>
          ),
        },
        {
          heading: "11. Kontaktaufnahme mit Firmen",
          body: (
            <>
              <p>
                Wir stellen {siteConfig.name} Firmen und Behörden persönlich
                vor, per E-Mail, Telefon, LinkedIn oder Brief. Dafür bearbeiten
                wir zu Ansprechpersonen Name, Funktion, Firma, geschäftliche
                E-Mail-Adresse und Telefonnummer, die Herkunft dieser Angaben
                sowie Datum und Inhalt unserer Kontakte und Ihrer Antworten.
              </p>
              <p>
                Die Angaben stammen aus öffentlich zugänglichen Quellen, etwa
                der Website Ihrer Firma, dem Handelsregister, Stelleninseraten
                oder LinkedIn, aus unserem persönlichen Netzwerk oder aus einer
                Empfehlung. Wir kaufen keine Adresslisten.
              </p>
              <p>
                Wir nutzen die Angaben nur, um Ihnen {siteConfig.name}{" "}
                vorzustellen, Termine zu vereinbaren und einen Pilotbetrieb zu
                begleiten. Wir verkaufen sie nicht, geben sie nicht an andere
                Firmen zur eigenen Nutzung weiter, verschicken keine
                Serienmails oder Newsletter und verbinden sie nicht mit Daten aus
                Zeugnissen. Die Korrespondenz führen wir über Microsoft 365
                (Abschnitt 5). Soweit die DSGVO anwendbar ist, etwa bei Firmen
                in Liechtenstein, stützen wir uns auf unser berechtigtes
                Interesse, Firmen unser Angebot vorzustellen (Art. 6 Abs. 1
                lit. f DSGVO).
              </p>
              <p>
                Bleibt eine Antwort aus, löschen wir die Angaben 12 Monate nach
                dem letzten Kontakt. Nutzt Ihre Firma {siteConfig.name}, gelten
                für Ihr Konto die Abschnitte 2 bis 6.
              </p>
              <p>
                <strong className={strong}>
                  Sie können dieser Bearbeitung jederzeit widersprechen.
                </strong>{" "}
                Eine kurze Antwort auf unsere Nachricht oder eine E-Mail an{" "}
                {mail} genügt. Danach kontaktieren wir Sie nicht mehr. Damit das
                so bleibt, behalten wir nur Ihre E-Mail-Adresse, Ihre Firma und
                das Datum des Widerspruchs in einer Sperrliste.
              </p>
            </>
          ),
        },
        {
          heading: "12. Änderungen dieser Erklärung",
          body: (
            <p>
              Wir passen diese Datenschutzerklärung an, wenn sich die
              Datenbearbeitung oder die Rechtslage ändert. Massgeblich ist
              jeweils die aktuell auf {siteConfig.domain} publizierte Fassung.
              Frühere Fassungen senden wir auf Anfrage zu.
            </p>
          ),
        },
      ]}
    />
  );
}
