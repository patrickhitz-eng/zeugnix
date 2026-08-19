/**
 * Betreiber-Angaben für Impressum, AGB und Datenschutzerklärung.
 * zeugnio.ch ist ein Produkt der advisori GmbH. Produktname "Zeugnio"
 * (Umbenennung von "zeugnix"); Domain auf "zeugnio.ch" umgestellt, die
 * Altdomain "zeugnix.ch" leitet dauerhaft (301) auf zeugnio.ch weiter.
 * Eingetragen im Handelsregister des Kantons Zug, Statutendatum 8. Mai 2026.
 *
 * Interimslösung: bei Gründung des geplanten Joint Ventures mit Christoph
 * Senn auf die neue Gesellschaft umstellen. Alle drei Legal-Seiten vor
 * Live-Schaltung juristisch prüfen lassen (Impressumspflicht: UWG Art. 3
 * Abs. 1 lit. s).
 */
export const companyInfo = {
  legalName: "advisori GmbH",
  legalForm: "GmbH",
  address: {
    street: "Neugasse 6",
    zipCity: "6300 Zug",
    country: "Schweiz",
  },
  uid: "CHE-101.807.980",
  commercialRegister: "Handelsregisteramt des Kantons Zug",
  representedBy: "Patrick Hitz, Geschäftsführer",
  contactEmail: "info@advisori.ch",
  contactPhone: undefined as string | undefined,
  jurisdiction: "Zug",
} as const;
