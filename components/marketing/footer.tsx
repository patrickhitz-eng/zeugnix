import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/lib/site-config";

const groups = [
  {
    title: "Produkt",
    links: [
      { href: "/app/certificates/new", label: "Zeugnis erstellen" },
      { href: "/verify", label: "Zeugnis prüfen" },
      { href: "/verify#analyse", label: "Zeugnis analysieren" },
      { href: "/pricing", label: "Preise" },
      { href: "/how-it-works", label: "So funktioniert's" },
    ],
  },
  {
    title: "Zielgruppen",
    links: [
      { href: "/for-employers", label: "Arbeitgeber" },
      { href: "/for-candidates", label: "Kandidatinnen & Kandidaten" },
      { href: "/for-recruiters", label: "Recruiter" },
      { href: "/for-employers#kmu", label: "KMU & Treuhand" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { href: "/legal/imprint", label: "Impressum" },
      { href: "/legal/privacy", label: "Datenschutz" },
      { href: "/legal/terms", label: "AGB" },
      { href: "/verify#disclaimer", label: "Hinweis zur Verifikation" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-ink-50/50">
      <div className="container-zx py-16">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo className="h-7 w-7" />
              <span className="text-[17px] font-medium tracking-tight">
                zeugnix
                <span className="text-petrol-600">.ch</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-ink-600">
              Schweizer Arbeitszeugnisse erstellen, mit kryptografischem Hash
              absichern, später überprüfbar und verständlich machen.
            </p>
            <p className="mt-6 text-xs text-ink-500">
              {siteConfig.contact.address}
              <br />
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="hover:text-petrol-700"
              >
                {siteConfig.contact.email}
              </a>
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="md:col-span-2">
              <h4 className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-500">
                {group.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13.5px] text-ink-700 transition-colors hover:text-petrol-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="md:col-span-2">
            <h4 className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-500">
              Hinweis
            </h4>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
              Die Plattform unterstützt die strukturierte Erstellung von
              Arbeitszeugnissen. Verantwortung für Wahrheit, Vollständigkeit
              und arbeitsrechtliche Zulässigkeit verbleibt beim ausstellenden
              Arbeitgeber.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-ink-200 pt-6 text-xs text-ink-500 md:flex-row md:items-center">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}.{" "}
            Schweizer Arbeitszeugnis-Plattform.
          </p>
          <p className="font-mono text-[10px] tracking-wide">
            Erstellen · Absichern · Prüfen · Verstehen
          </p>
        </div>
      </div>
    </footer>
  );
}
