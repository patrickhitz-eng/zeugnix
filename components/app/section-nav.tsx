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

  // Aktiv ist der letzte Abschnitt, dessen Anfang schon oben im Fenster liegt.
  // Ganz unten der letzte, auch wenn er zu kurz ist, um nach oben zu rücken.
  useEffect(() => {
    function update() {
      const targets = links
        .map((l) => document.getElementById(l.id))
        .filter((el): el is HTMLElement => !!el);
      if (targets.length === 0) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = targets[0]!.id;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= 140) current = el.id;
      }
      setActive(atBottom ? targets[targets.length - 1]!.id : current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
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
