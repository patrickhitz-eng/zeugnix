"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companies: { id: string; name: string }[];
}

export function NewCertificateForm({ companies }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Schritt 1 wählt nur noch den Zeugnistyp. Austrittsgrund, Opt-ins und
  // Wertschätzungsgrad (der Schlusssatz-Cluster) werden auf der Detailseite
  // gesetzt (SchlusssatzControls), damit die A4-Vorschau direkt mitläuft.
  const [zeugnisTyp, setZeugnisTyp] = useState<
    "schluss" | "zwischen" | "arbeitsbestaetigung"
  >("schluss");

  // Mitarbeitende und Zeugnis entstehen in einem Aufruf an /api/certificates.
  // Bisher schrieb der Browser beide Datensätze direkt in die Datenbank. Der Weg
  // über eine Server-Route hat zwei Gründe: die Daten-API auf dem eigenen Server
  // lauscht nur auf 127.0.0.1 und muss nie ins Internet – und scheitert der
  // zweite Schritt, nimmt die Route den ersten zurück. Bisher blieben in diesem
  // Fall Name, Geburtsdatum und Funktion ohne zugehöriges Zeugnis liegen.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const fd = new FormData(e.currentTarget);

    try {
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: fd.get("company_id"),
          zeugnis_typ: zeugnisTyp,
          first_name: fd.get("first_name"),
          last_name: fd.get("last_name"),
          gender: fd.get("gender"),
          date_of_birth: fd.get("date_of_birth") || null,
          function_title: fd.get("function_title"),
          entry_date: fd.get("entry_date"),
          exit_date: fd.get("exit_date") || null,
          employment_percentage: fd.get("employment_percentage"),
          is_manager: fd.get("is_manager") === "on",
          // Die Route trennt selbst an den Zeilenumbrüchen und wirft Leerzeilen weg.
          tasks: fd.get("tasks"),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? "Fehler beim Anlegen des Zeugnisses");
      }

      router.push(`/app/certificates/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anlegen des Zeugnisses");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Firma */}
      <Section title="Firma">
        <Field label="Firma">
          <select name="company_id" required className="input">
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Mitarbeitende */}
      <Section title="Mitarbeitende">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname">
            <input name="first_name" required className="input" />
          </Field>
          <Field label="Nachname">
            <input name="last_name" required className="input" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anrede / Geschlecht">
            <select name="gender" required className="input">
              <option value="f">Frau</option>
              <option value="m">Herr</option>
              <option value="d">Neutral</option>
            </select>
          </Field>
          <Field label="Geburtsdatum">
            <input name="date_of_birth" type="date" className="input" />
          </Field>
        </div>
        <Field label="Funktion">
          <input name="function_title" required className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Eintrittsdatum">
            <input name="entry_date" type="date" required className="input" />
          </Field>
          <Field label="Austrittsdatum (optional bei Zwischenzeugnis)">
            <input name="exit_date" type="date" className="input" />
          </Field>
          <Field label="Beschäftigungsgrad %">
            <input
              name="employment_percentage"
              type="number"
              min="1"
              max="100"
              defaultValue="100"
              className="input"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="is_manager" />
          <span>Person hat Führungsfunktion</span>
        </label>
      </Section>

      {/* Zeugnis */}
      <Section title="Zeugnis">
        <Field label="Zeugnistyp">
          <select
            required
            className="input"
            value={zeugnisTyp}
            onChange={(e) =>
              setZeugnisTyp(
                e.target.value as
                  | "schluss"
                  | "zwischen"
                  | "arbeitsbestaetigung",
              )
            }
          >
            <option value="schluss">Schlusszeugnis</option>
            <option value="zwischen">Zwischenzeugnis</option>
            <option value="arbeitsbestaetigung">Arbeitsbestätigung</option>
          </select>
        </Field>

        {zeugnisTyp === "arbeitsbestaetigung" && (
          <p className="text-[12px] leading-relaxed text-ink-500">
            Bestätigt nur Funktion und Dauer der Anstellung – ohne qualitative
            Beurteilung. Aufgaben sind optional; den Text können Sie nach der
            Generierung frei ergänzen.
          </p>
        )}

        {zeugnisTyp !== "arbeitsbestaetigung" && (
          <p className="text-[12px] leading-relaxed text-ink-500">
            Austrittsgrund, Wertschätzungsgrad und optionale Zusätze im
            Schlusssatz wählen Sie im nächsten Schritt direkt neben der Vorschau –
            so sehen Sie sofort, wie sich der Text verändert.
          </p>
        )}

        <Field label="Hauptaufgaben (eine pro Zeile)">
          <textarea
            name="tasks"
            rows={5}
            placeholder="Beratung von Geschäftskunden&#10;Vorbereitung der Quartalsabschlüsse&#10;Schulung neuer Mitarbeitender"
            className="input"
          />
        </Field>

      </Section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-ink-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary disabled:opacity-50"
        >
          {submitting ? "Wird gespeichert…" : "Weiter zur Beurteilung"}
        </button>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border: 1px solid rgb(228, 230, 234);
          border-radius: 6px;
          background: white;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: rgb(15, 122, 107);
          box-shadow: 0 0 0 3px rgba(15, 122, 107, 0.1);
        }
      `}</style>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 text-[14px] font-medium tracking-tight">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">
        {label}
      </span>
      {children}
    </label>
  );
}
