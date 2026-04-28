"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/supabase-client";

interface Company {
  id?: string;
  name?: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signatory_1_name?: string | null;
  signatory_1_role?: string | null;
  signatory_2_name?: string | null;
  signatory_2_role?: string | null;
}

interface Props {
  /** Wenn gesetzt: Edit-Modus, sonst Neu-Anlegen */
  company?: Company;
  /** Compact-Modus: nur Pflichtfelder, sonst alles */
  compact?: boolean;
}

export function CompanyForm({ company, compact = false }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!company?.id;

  async function uploadLogo(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo darf maximal 2 MB gross sein");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Nur Bilddateien (PNG, JPG, SVG) erlaubt");
      return;
    }
    setUploadingLogo(true);
    setError("");

    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${company?.id ?? "tmp"}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      setError(`Logo-Upload fehlgeschlagen: ${upErr.message}`);
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("company-logos")
      .getPublicUrl(path);

    setLogoUrl(urlData.publicUrl);
    setUploadingLogo(false);
  }

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

    const data: any = {
      name: (fd.get("name") as string)?.trim(),
      address: (fd.get("address") as string)?.trim() || null,
      postal_code: (fd.get("postal_code") as string)?.trim() || null,
      city: (fd.get("city") as string)?.trim() || null,
      website: (fd.get("website") as string)?.trim() || null,
      phone: (fd.get("phone") as string)?.trim() || null,
      email: (fd.get("email") as string)?.trim() || null,
      signatory_1_name: (fd.get("signatory_1_name") as string)?.trim() || null,
      signatory_1_role: (fd.get("signatory_1_role") as string)?.trim() || null,
      signatory_2_name: (fd.get("signatory_2_name") as string)?.trim() || null,
      signatory_2_role: (fd.get("signatory_2_role") as string)?.trim() || null,
      logo_url: logoUrl || null,
    };

    let dbErr;
    if (isEdit) {
      const { error: err } = await supabase
        .from("companies")
        .update(data)
        .eq("id", company!.id);
      dbErr = err;
    } else {
      data.created_by_user_id = user.id;
      const { error: err } = await supabase.from("companies").insert(data);
      dbErr = err;
    }

    if (dbErr) {
      setError(dbErr.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
    if (isEdit) {
      // Bleiben auf der Seite, nur Refresh
    } else {
      // Form zurücksetzen
      (e.target as HTMLFormElement).reset();
      setLogoUrl("");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Logo */}
      {!compact && (
        <div className="card p-5">
          <div className="text-[13px] font-medium tracking-tight">
            Firmenlogo
          </div>
          <p className="mt-1 text-[12px] text-ink-500">
            Erscheint im Briefkopf der Arbeitszeugnisse. PNG, JPG oder SVG, max. 2 MB.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50/50 overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[10px] text-ink-400">Kein Logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-ink-50 disabled:opacity-50"
              >
                {uploadingLogo
                  ? "Wird hochgeladen…"
                  : logoUrl
                    ? "Logo ändern"
                    : "Logo hochladen"}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="text-[11px] text-ink-500 hover:text-red-700"
                >
                  Entfernen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stammdaten */}
      <div className="card p-5">
        <div className="mb-4 text-[13px] font-medium tracking-tight">
          Stammdaten
        </div>
        <div className="space-y-4">
          <Field label="Firmenname *">
            <input
              name="name"
              required
              defaultValue={company?.name ?? ""}
              className="input"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Strasse">
                <input
                  name="address"
                  defaultValue={company?.address ?? ""}
                  className="input"
                />
              </Field>
            </div>
            <Field label="PLZ">
              <input
                name="postal_code"
                defaultValue={company?.postal_code ?? ""}
                className="input"
              />
            </Field>
          </div>
          <Field label="Ort">
            <input
              name="city"
              defaultValue={company?.city ?? ""}
              placeholder="Zürich"
              className="input"
            />
          </Field>
          {!compact && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Website">
                <input
                  name="website"
                  type="url"
                  defaultValue={company?.website ?? ""}
                  placeholder="https://www.firma.ch"
                  className="input"
                />
              </Field>
              <Field label="Telefon">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={company?.phone ?? ""}
                  placeholder="+41 44 123 45 67"
                  className="input"
                />
              </Field>
              <Field label="E-Mail">
                <input
                  name="email"
                  type="email"
                  defaultValue={company?.email ?? ""}
                  placeholder="info@firma.ch"
                  className="input"
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Unterzeichnende */}
      {!compact && (
        <div className="card p-5">
          <div className="mb-1 text-[13px] font-medium tracking-tight">
            Unterzeichnende Personen
          </div>
          <p className="mb-4 text-[12px] text-ink-500">
            Erscheinen am Ende des Arbeitszeugnisses als Unterschriftsblock.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Erste Person
              </div>
              <Field label="Name">
                <input
                  name="signatory_1_name"
                  defaultValue={company?.signatory_1_name ?? ""}
                  placeholder="Max Muster"
                  className="input"
                />
              </Field>
              <Field label="Funktion">
                <input
                  name="signatory_1_role"
                  defaultValue={company?.signatory_1_role ?? ""}
                  placeholder="Geschäftsleitung"
                  className="input"
                />
              </Field>
            </div>
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                Zweite Person (optional)
              </div>
              <Field label="Name">
                <input
                  name="signatory_2_name"
                  defaultValue={company?.signatory_2_name ?? ""}
                  placeholder="Anna Beispiel"
                  className="input"
                />
              </Field>
              <Field label="Funktion">
                <input
                  name="signatory_2_role"
                  defaultValue={company?.signatory_2_role ?? ""}
                  placeholder="HR-Leitung"
                  className="input"
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || uploadingLogo}
          className="btn-primary disabled:opacity-50"
        >
          {submitting
            ? "Wird gespeichert…"
            : isEdit
              ? "Änderungen speichern"
              : "Firma anlegen"}
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
