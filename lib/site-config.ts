// Registrierung offen (Entscheid 28.10.2026): Gratis-Erstellung für alle ist der
// Motor des Modells. Schutz gegen Fälscher ist nicht die Hürde beim Anmelden,
// sondern die Anzeige «Aussteller bestätigt / nicht bestätigt» auf /verify.
// Schliessen ginge über `false`: Start-Knöpfe führen dann zur Kontaktseite, der
// Anmeldelink geht nur an bestehende Konten, neue Kunden legt zeugnio im
// Supabase-Dashboard an (Authentication → Users → Invite). Serverseitig sperrt
// erst die Dashboard-Einstellung «Allow new users to sign up» – dieser Schalter
// steuert nur die Oberfläche.
const signupOpen = true;

export const siteConfig = {
  name: "zeugnio",
  domain: "zeugnio.ch",
  url: "https://zeugnio.ch",
  tagline: "Arbeitszeugnisse komplett neu gedacht.",
  subtagline: "Erstellen. Absichern. Prüfen. Verstehen.",
  description:
    "Erstellen Sie Schweizer Arbeitszeugnisse kostenlos, sichern Sie diese mit einem kryptografischen Hash ab und machen Sie Zeugnisse später überprüfbar und verständlich.",
  contact: {
    email: "info@advisori.ch",
  },
  signup: {
    open: signupOpen,
    cta: signupOpen
      ? { href: "/app/certificates/new", label: "Kostenlos starten" }
      : { href: "/contact", label: "Zugang anfragen" },
    note: "Während der Pilotphase richten wir den Zugang für jede Firma persönlich ein.",
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
