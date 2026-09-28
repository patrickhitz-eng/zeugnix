"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BRAND_THEMES,
  BUILTIN_THEMES,
  resolveThemeFromCompany,
} from "@/lib/design/document-tokens";

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
  default_certificate_font_family?: string | null;
  default_certificate_text_color?: string | null;
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
  // Ausgewählte, noch nicht hochgeladene Datei plus lokale Vorschau. Das Logo
  // geht erst nach dem Speichern zum Server: beim Anlegen einer neuen Firma gibt
  // es vorher noch keine ID, unter der es abgelegt werden könnte.
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!company?.id;
  const shownLogo = pendingPreview || (removeLogo ? "" : logoUrl);

  // Nur eine erste Rückmeldung für die Person am Bildschirm. Die verbindliche
  // Prüfung macht der Server (lib/uploads/logos.ts) – und zwar anhand der ersten
  // Bytes der Datei, nicht anhand der vom Browser gemeldeten Art.
  function selectLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo darf maximal 2 MB gross sein");
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Nur PNG oder JPG erlaubt (SVG wird im PDF nicht unterstützt)");
      return;
    }
    setError("");
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingLogo(file);
    setPendingPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
  }

  function clearLogo() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingLogo(null);
    setPendingPreview("");
    // Ein vorhandenes Logo wird erst beim Speichern entfernt, nicht beim Klick.
    if (logoUrl) setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = e.currentTarget;
    const fd = new FormData(form);

    // Immer vorhandene Felder. Im compact-Modus werden Logo, Kontakt- und
    // Unterzeichner-Felder NICHT gerendert – diese dürfen dann auch nicht ins
    // Update, sonst würden bestehende Werte mit null überschrieben. Die
    // Server-Route schreibt darum ausschliesslich übergebene Felder.
    const data: Record<string, unknown> = {
      name: (fd.get("name") as string)?.trim(),
      address: (fd.get("address") as string)?.trim() || null,
      postal_code: (fd.get("postal_code") as string)?.trim() || null,
      city: (fd.get("city") as string)?.trim() || null,
    };

    if (!compact) {
      data.website = (fd.get("website") as string)?.trim() || null;
      data.phone = (fd.get("phone") as string)?.trim() || null;
      data.email = (fd.get("email") as string)?.trim() || null;
      data.signatory_1_name = (fd.get("signatory_1_name") as string)?.trim() || null;
      data.signatory_1_role = (fd.get("signatory_1_role") as string)?.trim() || null;
      data.signatory_2_name = (fd.get("signatory_2_name") as string)?.trim() || null;
      data.signatory_2_role = (fd.get("signatory_2_role") as string)?.trim() || null;
      // Hält die Theme-ID (lib/design/document-tokens.ts). Der Spaltenname ist
      // historisch; resolveTheme() versteht auch die Alt-Font-Keys.
      data.default_certificate_font_family =
        (fd.get("default_certificate_font_family") as string)?.trim() || null;
      // logo_url wird nur beim Entfernen mitgeschickt. Gesetzt wird es
      // ausschliesslich von /api/companies/<id>/logo – sonst könnte hier eine
      // beliebige Adresse eingetragen werden, die die PDF-Route dann abruft.
      if (removeLogo) data.logo_url = null;
      // default_certificate_text_color wird bewusst nicht mehr geschrieben:
      // die Textfarbe gehört zum Theme. Die Spalte bleibt als Altlast bestehen.
    }

    async function speichern(): Promise<string> {
      const response = await fetch(
        isEdit ? `/api/companies/${company!.id}` : "/api/companies",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Speichern fehlgeschlagen.");
      return (result.id as string) ?? company!.id!;
    }

    try {
      const companyId = await speichern();

      if (pendingLogo) {
        const upload = new FormData();
        upload.append("file", pendingLogo);
        const response = await fetch(`/api/companies/${companyId}/logo`, {
          method: "POST",
          body: upload,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          // Die Stammdaten sind gespeichert, nur das Logo nicht. Das muss die
          // Meldung sagen, sonst speichert jemand aus Unsicherheit ein zweites Mal.
          throw new Error(
            `Die Stammdaten sind gespeichert, das Logo nicht: ${result.error ?? "unbekannter Fehler"}`,
          );
        }
        setLogoUrl(result.logo_url as string);
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingLogo(null);
        setPendingPreview("");
      }

      if (removeLogo) {
        setLogoUrl("");
        setRemoveLogo(false);
      }

      router.refresh();
      if (!isEdit) {
        form.reset();
        setLogoUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
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
            Erscheint im Briefkopf der Arbeitszeugnisse. PNG oder JPG, max. 2 MB.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50/50 overflow-hidden">
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownLogo}
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
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) selectLogo(f);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-ink-50 disabled:opacity-50"
              >
                {shownLogo ? "Logo ändern" : "Logo auswählen"}
              </button>
              {shownLogo && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="text-[11px] text-ink-500 hover:text-red-700"
                >
                  Entfernen
                </button>
              )}
              {pendingLogo && (
                <span className="text-[11px] text-ink-500">
                  Wird beim Speichern übertragen
                </span>
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

      {/* Dokument-Stil (Theme) */}
      {!compact && (
        <div className="card p-5">
          <div className="mb-1 text-[13px] font-medium tracking-tight">
            Stil der Zeugnisse
          </div>
          <p className="mb-4 text-[12px] text-ink-500">
            Schriften, Farben und Abstände des Zeugnisses folgen einem
            abgestimmten Stil. Schriftgrössen und Seitenränder sind bewusst
            festgelegt, damit jedes Zeugnis einheitlich wirkt.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stil">
              {/* Spaltenname bleibt default_certificate_font_family: sie hält
                  jetzt die Theme-ID. resolveTheme() versteht auch die
                  Alt-Werte helvetica|times|courier – daher keine Migration.

                  Hat die Firma ein privates Marken-Theme (Whitelabeling, zentral
                  per SQL gesetzt), erscheint KEIN Picker – die Marken-Themes sind
                  bewusst nicht öffentlich wählbar. Stattdessen eine gesperrte Zeile
                  plus Hidden-Input, damit das Speichern des Formulars das
                  Marken-Theme nicht auf einen Standard-Stil zurücksetzt. */}
              {resolveThemeFromCompany(company ?? {}).id in BRAND_THEMES ? (
                <>
                  <input
                    type="hidden"
                    name="default_certificate_font_family"
                    value={resolveThemeFromCompany(company ?? {}).id}
                  />
                  <div className="input flex items-center justify-between gap-2 bg-ink-50/50 text-ink-500">
                    <span>Individuelles Markendesign</span>
                    <span className="text-[11px]">zentral verwaltet</span>
                  </div>
                </>
              ) : (
                <select
                  name="default_certificate_font_family"
                  defaultValue={resolveThemeFromCompany(company ?? {}).id}
                  className="input"
                >
                  {Object.values(BUILTIN_THEMES).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
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
          disabled={submitting}
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
