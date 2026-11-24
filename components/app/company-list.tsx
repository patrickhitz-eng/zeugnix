"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyGroup, CompanyRow } from "@/lib/company/overview";

/** Logo der Firma, sonst die Initialen auf der Akzentfarbe der Vorlage. */
export function CompanyBadge({
  name,
  logoUrl,
  accent,
  size = 32,
}: {
  name: string;
  logoUrl: string | null;
  accent: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (logoUrl) {
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("de-CH"))
    .join("");
  return (
    <span
      style={{ ...style, background: accent, fontSize: Math.round(size * 0.34) }}
      className="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function Row({ company }: { company: CompanyRow }) {
  const router = useRouter();
  const href = `/app/company/${company.id}`;
  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-b border-ink-100 last:border-0 hover:bg-ink-50"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <CompanyBadge name={company.name} logoUrl={company.logoUrl} accent={company.accent} />
          <div className="min-w-0">
            {/* Echter Link für Tastatur und «in neuem Tab öffnen». */}
            <a href={href} onClick={(e) => e.stopPropagation()} className="font-medium text-ink-900 hover:text-petrol-700">
              {company.name}
            </a>
            {company.similarName && (
              <span className="ml-2 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                ähnlicher Name
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 text-ink-600 md:table-cell">{company.city || "–"}</td>
      <td className="px-4 py-3 tabular-nums text-ink-700">{company.certificates}</td>
      <td className="px-4 py-3">
        {company.domainVerified ? (
          <span className="rounded-full bg-petrol-50 px-2.5 py-0.5 text-[11px] font-medium text-petrol-700">
            bestätigt
          </span>
        ) : (
          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            offen
          </span>
        )}
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
          <span className="h-3.5 w-3.5 rounded" style={{ background: company.accent }} aria-hidden="true" />
          {company.themeLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-ink-400" aria-hidden="true">
        ›
      </td>
    </tr>
  );
}

export function CompanyList({ groups, total }: { groups: CompanyGroup[]; total: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("de-CH");
  const filtered = groups
    .map((g) => ({
      ...g,
      companies: q
        ? g.companies.filter(
            (c) =>
              c.name.toLocaleLowerCase("de-CH").includes(q) ||
              c.city.toLocaleLowerCase("de-CH").includes(q),
          )
        : g.companies,
    }))
    .filter((g) => g.companies.length > 0);
  const shown = filtered.reduce((n, g) => n + g.companies.length, 0);
  const showGroupTitles = groups.length > 1;
  const similar = groups.flatMap((g) => g.companies).filter((c) => c.similarName);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Firma oder Ort suchen"
          aria-label="Firma oder Ort suchen"
          className="w-full max-w-xs rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] focus:border-petrol-500 focus:outline-none"
        />
        <span className="text-[12px] text-ink-500">
          {q ? `${shown} von ${total} Firmen` : `${total} Firmen`}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="card px-4 py-6 text-[13px] text-ink-600">Keine Firma passt zu «{query}».</p>
      )}

      <div className="space-y-6">
        {filtered.map((group) => (
          <section key={group.organizationId}>
            {showGroupTitles && (
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-500">
                Organisation {group.organizationName}
                {!group.isAdmin && <span className="ml-2 normal-case tracking-normal">(Mitglied)</span>}
              </h2>
            )}
            <div className="card overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-[11.5px] uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Ort</th>
                    <th className="px-4 py-3 font-medium">Zeugnisse</th>
                    <th className="px-4 py-3 font-medium">Domain</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Vorlage</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {group.companies.map((c) => (
                    <Row key={c.id} company={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {similar.length > 0 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          Einige Firmen heissen fast gleich. Ist eine davon doppelt erfasst, öffnen Sie sie
          und entfernen sie unter «Export & Löschen». Vorher prüfen, an welchem Eintrag
          Zeugnisse hängen.
        </p>
      )}
    </div>
  );
}
