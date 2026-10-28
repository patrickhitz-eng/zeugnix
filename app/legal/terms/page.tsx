import { LegalContent } from "@/components/marketing/legal-content";
import { companyInfo } from "@/lib/legal/company-info";
import { siteConfig } from "@/lib/site-config";
import { TERMS_LABEL } from "@/lib/legal/terms";

export const metadata = { title: "AGB" };

// TODO(Patrick): vor Live-Schaltung juristisch prüfen lassen.
export default function Page() {
  return (
    <LegalContent
      title="Allgemeine Geschäftsbedingungen"
      updated={TERMS_LABEL}
      intro={
        <>
          Diese Allgemeinen Geschäftsbedingungen (AGB) regeln die Nutzung
          von {siteConfig.domain} durch registrierte Nutzerinnen und
          Nutzer.
        </>
      }
      sections={[
        {
          heading: "1. Geltungsbereich",
          body: (
            <p>
              Diese AGB gelten für alle Verträge zwischen{" "}
              {companyInfo.legalName} („{siteConfig.name}") und
              Nutzerinnen und Nutzern von{" "}
              {siteConfig.domain}. Mit der Registrierung akzeptieren Sie
              diese AGB.
            </p>
          ),
        },
        {
          heading: "2. Leistungsbeschreibung",
          body: (
            <p>
              {siteConfig.name} ermöglicht die Erstellung Schweizer
              Arbeitszeugnisse, deren kryptografische Absicherung mittels
              Hash sowie deren spätere Prüfung und Analyse. Die Erstellung
              ist unbegrenzt kostenlos. Prüfung und Analyse sind
              kostenpflichtige Leistungen; während der Beta-Phase werden sie
              kostenlos angeboten (siehe Ziffer 4).
            </p>
          ),
        },
        {
          heading: "3. Registrierung und Konto",
          body: (
            <p>
              Die Anmeldung erfolgt passwortlos per Magic Link an die
              angegebene E-Mail-Adresse. Sie sind verpflichtet, wahre und
              vollständige Angaben zu machen und Ihr Konto vor unbefugtem
              Zugriff zu schützen.
            </p>
          ),
        },
        {
          heading: "4. Preise und Zahlung",
          body: (
            <p>
              Die aktuell gültigen Preise sind auf {siteConfig.domain}{" "}
              /pricing ausgewiesen. Während der Beta-Phase sind Prüfung und
              Analyse kostenlos nutzbar; ein regulärer Preis wird erst nach
              Ende der Beta-Phase und mit vorheriger Ankündigung erhoben.
              Alle Preise verstehen sich, sofern nicht anders angegeben, in
              Schweizer Franken.
            </p>
          ),
        },
        {
          heading: "5. Verantwortung für Zeugnisinhalte",
          body: (
            <p>
              {siteConfig.name} stellt die technische Plattform zur
              Erstellung von Arbeitszeugnissen zur Verfügung. Die
              Verantwortung für Wahrheit, Vollständigkeit und
              arbeitsrechtliche Zulässigkeit der erfassten Inhalte liegt
              ausschliesslich beim ausstellenden Arbeitgeber.
            </p>
          ),
        },
        {
          heading: "6. Nutzungspflichten",
          body: (
            <p>
              Sie verpflichten sich, die Plattform nicht missbräuchlich zu
              nutzen, insbesondere keine falschen Identitäten anzugeben,
              keine Rechte Dritter zu verletzen und die Plattform nicht für
              rechtswidrige Zwecke einzusetzen.
            </p>
          ),
        },
        {
          heading: "7. Verfügbarkeit",
          body: (
            <p>
              Wir bemühen uns um eine hohe Verfügbarkeit der Plattform,
              können diese jedoch insbesondere während der Beta-Phase nicht
              garantieren. Wartungsarbeiten und Unterbrechungen sind
              möglich.
            </p>
          ),
        },
        {
          heading: "8. Haftung",
          body: (
            <p>
              Wir haften nur für Schäden, die auf grobe Fahrlässigkeit oder
              Vorsatz zurückzuführen sind. Für die inhaltliche Richtigkeit
              der von Nutzenden erfassten Zeugnistexte übernehmen wir keine
              Haftung.
            </p>
          ),
        },
        {
          heading: "9. Kündigung",
          body: (
            <p>
              Sie können Ihr Konto jederzeit ohne Angabe von Gründen löschen
              lassen. Wir behalten uns vor, Konten bei Verstoss gegen diese
              AGB zu sperren oder zu löschen.
            </p>
          ),
        },
        {
          heading: "10. Änderungen dieser AGB",
          body: (
            <p>
              Wir können diese AGB mit angemessener Vorankündigung anpassen.
              Massgeblich ist jeweils die zum Zeitpunkt der Nutzung auf{" "}
              {siteConfig.domain} publizierte Fassung.
            </p>
          ),
        },
        {
          heading: "11. Anwendbares Recht und Gerichtsstand",
          body: (
            <p>
              Es gilt Schweizer Recht. Gerichtsstand ist, soweit gesetzlich
              zulässig, {companyInfo.jurisdiction}.
            </p>
          ),
        },
      ]}
    />
  );
}
