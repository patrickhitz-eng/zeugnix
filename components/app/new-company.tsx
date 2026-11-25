"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { companyNameKey } from "@/lib/loeschen/confirm";

/**
 * «Firma anlegen» in kurz: nur Name und Adresse. Danach öffnet sich die neue
 * Firma auf ihrer Detailseite, dort kommen Logo, Unterzeichnende und Vorlage
 * dazu. Gibt es den Namen (ohne Schreibweise und Satzzeichen) schon, warnt das
 * Formular einmal; ein zweiter Klick legt die Firma trotzdem an.
 */
export function NewCompanyForm({
  existingNames,
  onCancel,
}: {
  existingNames: string[];
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ key: string; name: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = ((fd.get("name") as string) ?? "").trim();
    const key = companyNameKey(name);
    const existing = existingNames.find((n) => companyNameKey(n) === key);
    if (key && existing && duplicate?.key !== key) {
      setDuplicate({ key, name: existing });
      return;
    }

    setBusy(true);
    setError("");
    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        address: ((fd.get("address") as string) ?? "").trim() || null,
        postal_code: ((fd.get("postal_code") as string) ?? "").trim() || null,
        city: ((fd.get("city") as string) ?? "").trim() || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) {
      setBusy(false);
      setError(result.error ?? "Die Firma liess sich nicht anlegen.");
      return;
    }
    router.push(`/app/company/${result.id}?neu=1`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[12px] text-ink-600" htmlFor="nc-name">
          Firmenname *
        </label>
        <input
          id="nc-name"
          name="name"
          required
          autoFocus
          onChange={() => setDuplicate(null)}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] focus:border-petrol-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] text-ink-600" htmlFor="nc-address">
          Strasse
        </label>
        <input
          id="nc-address"
          name="address"
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] focus:border-petrol-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink-600" htmlFor="nc-plz">
            PLZ
          </label>
          <input
            id="nc-plz"
            name="postal_code"
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] focus:border-petrol-500 focus:outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[12px] text-ink-600" htmlFor="nc-city">
            Ort
          </label>
          <input
            id="nc-city"
            name="city"
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] focus:border-petrol-500 focus:outline-none"
          />
        </div>
      </div>

      {duplicate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Die Firma «{duplicate.name}» gibt es schon. Wollen Sie wirklich eine zweite
          Firma mit diesem Namen anlegen, klicken Sie nochmals auf «Firma anlegen».
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary py-2 text-[13px]">
            Abbrechen
          </button>
        )}
        <button type="submit" disabled={busy} className="btn-primary py-2 text-[13px] disabled:opacity-50">
          {busy ? "Wird angelegt…" : "Firma anlegen"}
        </button>
      </div>
    </form>
  );
}

/** Knopf oben rechts, öffnet das kurze Formular als Fenster. */
export function NewCompanyButton({
  existingNames,
  variant = "primary",
}: {
  existingNames: string[];
  /** «secondary» auf der Seite einer Firma, wo das Anlegen Nebensache ist. */
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} py-2.5 text-[13px]`}
      >
        + Firma anlegen
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Klick auf den abgedunkelten Hintergrund schliesst das Fenster.
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="w-[calc(100%-32px)] max-w-[480px] rounded-xl border border-ink-200 p-0 backdrop:bg-ink-900/35"
      >
        {open && (
          <div className="p-6">
            <h2 className="text-[15px] font-medium tracking-tight">Firma anlegen</h2>
            <p className="mb-5 mt-1 text-[12.5px] text-ink-500">
              Name und Adresse genügen. Logo, Unterzeichnende und Vorlage ergänzen Sie
              danach in der Firma.
            </p>
            <NewCompanyForm existingNames={existingNames} onCancel={() => setOpen(false)} />
          </div>
        )}
      </dialog>
    </>
  );
}
