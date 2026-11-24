"use client";

import { useEffect, useState } from "react";

export interface SectionLink {
  id: string;
  label: string;
  danger?: boolean;
}

/**
 * Sprungmarken links neben dem Formular der Firma. Markiert den Abschnitt,
 * der gerade oben im Fenster steht. Auf schmalen Bildschirmen eine Zeile
 * über dem Formular.
 */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [active, setActive] = useState(links[0]?.id ?? "");

  useEffect(() => {
    const targets = links
      .map((l) => document.getElementById(l.id))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [links]);

  return (
    <nav
      aria-label="Abschnitte"
      className="flex flex-wrap gap-1 lg:sticky lg:top-6 lg:flex-col lg:gap-0"
    >
      {links.map((link) => {
        const on = active === link.id;
        return (
          <a
            key={link.id}
            href={`#${link.id}`}
            onClick={() => setActive(link.id)}
            aria-current={on ? "location" : undefined}
            className={`border-b-2 px-3 py-1.5 text-[13px] transition-colors lg:border-b-0 lg:border-l-2 ${
              on
                ? "border-petrol-600 font-medium text-petrol-700"
                : link.danger
                  ? "border-ink-200 text-red-700 hover:text-red-800"
                  : "border-ink-200 text-ink-600 hover:text-petrol-700"
            }`}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
