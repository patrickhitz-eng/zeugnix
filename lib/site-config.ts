export const siteConfig = {
  name: "zeugnix",
  domain: "zeugnix.ch",
  url: "https://zeugnix.ch",
  tagline: "Arbeitszeugnisse komplett neu gedacht.",
  subtagline: "Erstellen. Absichern. Prüfen. Verstehen.",
  description:
    "Erstellen Sie Schweizer Arbeitszeugnisse kostenlos, sichern Sie diese mit einem kryptografischen Hash ab und machen Sie Zeugnisse später überprüfbar und verständlich.",
  contact: {
    email: "kontakt@zeugnix.ch",
    address: "Zürich, Schweiz",
  },
  prices: {
    create: { amount: 0, label: "CHF 0", note: "Unbegrenzt kostenlos" },
    verify: { amount: 19.9, label: "CHF 19.90", note: "Pro Prüfung" },
    analyse: { amount: 29.9, label: "CHF 29.90", note: "Pro Zeugnis" },
    premium: { amount: 39.9, label: "CHF 39.90", note: "Echtheit + Analyse" },
    company: { amount: 49, label: "ab CHF 49 / Monat", note: "Firmenpaket" },
  },
} as const;

export type SiteConfig = typeof siteConfig;
