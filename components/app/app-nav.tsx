"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Übersicht" },
  { href: "/app/certificates", label: "Zeugnisse" },
  { href: "/app/certificates/new", label: "Neues Zeugnis" },
  { href: "/app/company", label: "Firma" },
  { href: "/app/team", label: "Team" },
  { href: "/app/daten", label: "Daten" },
];

function isActive(pathname: string, href: string): boolean {
  // "Neues Zeugnis" nur bei exaktem Pfad markieren, sonst würde es immer
  // gleichzeitig mit "Zeugnisse" leuchten.
  if (href === "/app/certificates/new") return pathname === href;
  // "Zeugnisse" auch auf Detailseiten (/app/certificates/[id]) aktiv, aber
  // nicht auf der Neu-Seite.
  if (href === "/app/certificates") {
    return (
      pathname === href ||
      (pathname.startsWith("/app/certificates/") &&
        pathname !== "/app/certificates/new")
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`block rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors ${
              active
                ? "bg-white text-petrol-700 shadow-sm"
                : "text-ink-700 hover:bg-white hover:text-petrol-700"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
