"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/supabase-client";

interface Props {
  companies: { id: string; name: string }[];
}

export function NewCertificateForm({ companies }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Nicht angemeldet");
      setSubmitting(false);
      return;
    }

    // 1. Employee anlegen
    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .insert({
        company_id: fd.get("company_id"),
        first_name: fd.get("first_name") as string,
        last_name: fd.get("last_name") as string,
        gender: fd.get("gender") as string,
        function_title: fd.get("function_title") as string,
        entry_date: fd.get("entry_date"),
        exit_date: (fd.get("exit_date") as string) || null,
        employment_percentage: parseInt(fd.get("employment_percentage") as string) || 100,
        is_manager: fd.get("is_manager") === "on",
      })
      .select()
      .single();

    if (empErr || !employee) {
      setError(empErr?.message ?? "Fehler beim Anlegen der Mitarbeiterin");
      setSubmitting(false);
      return;
    }

    // 2. Certificate anlegen
    const tasks = (fd.get("tasks") as string)
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const { data: cert, error: certErr } = await supabase
      .from("certificates")
      .insert({
        company_id: fd.get("company_id"),
        employee_id: employee.id,
        type: fd.get("type"),
        tasks,
        status: "draft",
        thank_employee: fd.get("thank_employee") === "on",
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (certErr || !cert) {
      setError(certErr?.message ?? "Fehler beim Anlegen des Zeugnisses");
      setSubmitting(false);
      return;
    }

    router.push(`/app/certificates/${cert.id}`);
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
          <Field label="Funktion">
            <input name="function_title" required className="input" />
          </Field>
        </div>
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
          <select name="type" required className="input">
            <option value="schluss">Schlusszeugnis</option>
            <option value="zwischen">Zwischenzeugnis</option>
            <option value="funktionswechsel">Funktionswechsel</option>
            <option value="vorgesetztenwechsel">Vorgesetztenwechsel</option>
            <option value="interner_wechsel">Interner Wechsel</option>
            <option value="reorganisation">Reorganisation</option>
            <option value="wunsch_mitarbeiterin">Wunsch der Mitarbeiterin</option>
            <option value="wunsch_mitarbeiter">Wunsch des Mitarbeiters</option>
          </select>
        </Field>
        <Field label="Hauptaufgaben (eine pro Zeile)">
          <textarea
            name="tasks"
            rows={5}
            placeholder="Beratung von Geschäftskunden&#10;Vorbereitung der Quartalsabschlüsse&#10;Schulung neuer Mitarbeitender"
            className="input"
          />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="thank_employee" defaultChecked />
          <span>Dank in Schlussformel inkludieren</span>
        </label>
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
          {submitting ? "Wird gespeichert…" : "Weiter zu Beurteilung"}
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
