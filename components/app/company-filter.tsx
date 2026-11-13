"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Firmenfilter für Listen. Die gewählte Firma steht als `?firma=<id>` in der
 * Adresse, nicht in der Sitzung: so zeigen zwei Tabs problemlos zwei Firmen,
 * und ein Link auf die gefilterte Liste lässt sich weitergeben.
 */
export function CompanyFilter({
  companies,
  selected,
}: {
  companies: { id: string; name: string }[];
  selected: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("firma", value);
    else params.delete("firma");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-[12.5px] text-ink-600">
      <span>Firma</span>
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800"
      >
        <option value="">Alle Firmen</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
