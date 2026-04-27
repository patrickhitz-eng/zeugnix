"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/supabase-client";

export function CompanyForm() {
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

    const { error: err } = await supabase.from("companies").insert({
      name: fd.get("name") as string,
      address: fd.get("address") as string,
      city: fd.get("city") as string,
      postal_code: fd.get("postal_code") as string,
      created_by_user_id: user.id,
    });

    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Firmenname">
        <input name="name" required className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Strasse">
            <input name="address" className="input" />
          </Field>
        </div>
        <Field label="PLZ">
          <input name="postal_code" className="input" />
        </Field>
      </div>
      <Field label="Ort">
        <input name="city" className="input" placeholder="Zürich" />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary disabled:opacity-50"
      >
        {submitting ? "Wird gespeichert…" : "Firma anlegen"}
      </button>

      <style>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border: 1px solid rgb(228, 230, 234);
          border-radius: 6px;
          background: white;
          outline: none;
        }
        .input:focus {
          border-color: rgb(15, 122, 107);
          box-shadow: 0 0 0 3px rgba(15, 122, 107, 0.1);
        }
      `}</style>
    </form>
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
