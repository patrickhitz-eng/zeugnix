"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Häkchen + Knopf für die AGB-Zustimmung (Fahrplan Marktstart, Schritt 11).
 *
 * Nach dem Speichern ein harter Reload (window.location.assign) statt
 * router.push: Das App-Layout prüft die Zustimmung serverseitig und soll die
 * neue Zeile sicher sehen – gleiches Prinzip wie lib/auth/finish-login.ts.
 */
export function TermsAcceptForm({
  version,
  label,
  next,
}: {
  version: string;
  label: string;
  next: string;
}) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen.");
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="flex items-start gap-3 rounded-md border border-ink-200 bg-white p-4 text-[14px] leading-relaxed text-ink-800">
        <input
          type="checkbox"
          required
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4 flex-shrink-0 accent-petrol-700"
        />
        <span>
          Ich habe die{" "}
          <Link
            href="/legal/terms"
            target="_blank"
            className="font-medium text-petrol-700 underline underline-offset-2"
          >
            AGB
          </Link>{" "}
          in der Fassung vom {label} gelesen und nehme sie an.
        </span>
      </label>

      <p className="text-[12.5px] leading-relaxed text-ink-500">
        Wie wir mit Personendaten umgehen, steht in der{" "}
        <Link
          href="/legal/privacy"
          target="_blank"
          className="underline underline-offset-2 hover:text-petrol-700"
        >
          Datenschutzerklärung
        </Link>
        .
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!checked || saving}
        className="btn-primary w-full disabled:opacity-50"
      >
        {saving ? "Wird gespeichert…" : "Annehmen und weiter"}
      </button>
    </form>
  );
}
