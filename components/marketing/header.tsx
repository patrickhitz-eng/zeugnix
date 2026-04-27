import Link from "next/link";
import { Logo } from "@/components/ui/logo";

const nav = [
  { href: "/how-it-works", label: "So funktioniert's" },
  { href: "/verify", label: "Prüfen" },
  { href: "/pricing", label: "Preise" },
  { href: "/for-employers", label: "Für Arbeitgeber" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-200/80 bg-white/85 backdrop-blur-md">
      <div className="container-zx flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="zeugnix.ch Startseite"
        >
          <Logo className="h-7 w-7" />
          <span className="text-[17px] font-medium tracking-tight">
            zeugnix
            <span className="text-petrol-600">.ch</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13.5px] font-medium text-ink-700 transition-colors hover:text-petrol-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden text-[13.5px] font-medium text-ink-700 transition-colors hover:text-petrol-700 sm:inline-block"
          >
            Anmelden
          </Link>
          <Link href="/app/certificates/new" className="btn-primary px-4 py-2.5 text-[13px]">
            Kostenlos starten
          </Link>
        </div>
      </div>
    </header>
  );
}
