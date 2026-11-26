"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SignoffBindingState } from "@/lib/certificate/signoff-binding";

export interface SignoffSlot {
  slot: 1 | 2;
  name: string;
  role: string | null;
}

export interface SignoffRow {
  slot: number;
  email: string;
  name: string | null;
  status: string;
  confirmed_at: string | null;
  sent_at: string | null;
  /**
   * M3: Passt eine Bestätigung noch zum Text und zur Person im
   * Unterschriftsfeld? Siehe lib/certificate/signoff-binding.ts.
   */
  binding?: SignoffBindingState;
}

interface Props {
  certificateId: string;
  slots: SignoffSlot[];
  initialSignoffs: SignoffRow[];
}

interface SlotUiState {
  email: string;
  url: string | null;
  emailSent: boolean | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * V2 — identitätsgebundene Unterzeichner-Freigabe (HR-Seite).
 *
 * Fordert pro Unterschrifts-Slot eine Freigabe per Magic-Link an und zeigt den
 * Status (angefordert / bestätigt / abgelehnt). Optional und nicht blockierend:
 * das Zeugnis kann auch ohne Freigabe finalisiert werden — die Freigabe ist ein
 * zusätzliches Echtheitssignal.
 */
export function CertificateSignoffControls({
  certificateId,
  slots,
  initialSignoffs,
}: Props) {
  const router = useRouter();
  const [signoffs, setSignoffs] = useState<SignoffRow[]>(initialSignoffs);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [ui, setUi] = useState<Record<number, SlotUiState>>(() => {
    const init: Record<number, SlotUiState> = {};
    for (const s of slots) {
      const existing = initialSignoffs.find((r) => r.slot === s.slot);
      init[s.slot] = { email: existing?.email ?? "", url: null, emailSent: null };
    }
    return init;
  });

  function setSlotUi(slot: number, patch: Partial<SlotUiState>) {
    setUi((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
  }

  async function request(slot: number) {
    const email = ui[slot]?.email?.trim();
    if (!email) return;
    setBusySlot(slot);
    setError("");
    try {
      const res = await fetch(`/api/certificates/${certificateId}/signoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Freigabe konnte nicht angefordert werden.");
        return;
      }
      setSignoffs((prev) => {
        const others = prev.filter((r) => r.slot !== slot);
        return [
          ...others,
          { slot, email, name: null, status: "pending", confirmed_at: null, sent_at: new Date().toISOString() },
        ];
      });
      setSlotUi(slot, { url: data.signoff_url ?? null, emailSent: !!data.email_sent });
      router.refresh();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setBusySlot(null);
    }
  }

  if (slots.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-1 text-[13px] font-medium tracking-tight">
        Unterschriften-Freigabe <span className="text-ink-500">(optional)</span>
      </div>
      <p className="mb-4 text-[12px] text-ink-500">
        Lassen Sie die unterzeichnenden Personen das Zeugnis per E-Mail
        bestätigen. Die Bestätigung wird festgehalten und erscheint auf dem
        Zeugnis und in der öffentlichen Prüfung. Als Beleg für die Person gilt
        sie dort nur, wenn die Adresse an der verifizierten Domain Ihrer Firma
        liegt. Das Finalisieren ist auch ohne Freigabe möglich.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {slots.map((s) => {
          const row = signoffs.find((r) => r.slot === s.slot);
          const slotUi = ui[s.slot] ?? { email: "", url: null, emailSent: null };
          // M3: Bestätigt, aber zu einem anderen Text oder einer anderen
          // Person im Unterschriftsfeld. Zählt nicht und lässt sich neu anfordern.
          const stale =
            row?.status === "confirmed" &&
            !!row.binding &&
            row.binding !== "bound" &&
            row.binding !== "open";
          const confirmed = row?.status === "confirmed" && !stale;
          const declined = row?.status === "declined";
          const pending = row && (row.status === "pending" || row.status === "viewed");

          return (
            <div
              key={s.slot}
              className="rounded-md border border-ink-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium text-ink-800">
                  {s.name}
                  {s.role ? (
                    <span className="font-normal text-ink-500">, {s.role}</span>
                  ) : null}
                </div>
                {confirmed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-petrol-100 px-2 py-0.5 text-[10.5px] font-medium text-petrol-800">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Freigegeben
                  </span>
                )}
                {stale && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
                    Veraltet
                  </span>
                )}
                {declined && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-medium text-red-800">
                    Abgelehnt
                  </span>
                )}
                {pending && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
                    Ausstehend
                  </span>
                )}
              </div>

              {confirmed ? (
                <p className="mt-2 text-[12px] text-ink-600">
                  Freigegeben am {formatDate(row!.confirmed_at)}
                  {row?.email ? ` durch ${row.email}` : ""}.
                </p>
              ) : (
                <div className="mt-3">
                  {stale && (
                    <p className="mb-2 text-[11.5px] leading-relaxed text-amber-800">
                      Freigegeben am {formatDate(row!.confirmed_at)}, aber{" "}
                      {row!.binding === "stale_name"
                        ? "Name oder Rolle im Unterschriftsfeld wurden danach geändert"
                        : row!.binding === "stale_text"
                          ? "der Zeugnistext wurde danach geändert"
                          : "die Freigabe stammt von vor der Textbindung und lässt sich keinem Text zuordnen"}
                      . Sie erscheint nicht auf dem Zeugnis und nicht in der
                      Prüfung. Bitte neu anfordern.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={slotUi.email}
                      onChange={(e) => setSlotUi(s.slot, { email: e.target.value })}
                      placeholder={`E-Mail von ${s.name}`}
                      className="w-full rounded-md border border-ink-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-petrol-600"
                    />
                    <button
                      type="button"
                      onClick={() => request(s.slot)}
                      disabled={busySlot === s.slot || !slotUi.email.trim()}
                      className="btn-secondary shrink-0 py-2 text-[12px] disabled:opacity-50"
                    >
                      {busySlot === s.slot
                        ? "Wird gesendet…"
                        : pending || stale
                          ? "Erneut anfordern"
                          : "Freigabe anfordern"}
                    </button>
                  </div>

                  {pending && !slotUi.url && (
                    <p className="mt-2 text-[11.5px] text-ink-500">
                      Angefordert an {row!.email} — Antwort ausstehend.
                    </p>
                  )}

                  {slotUi.emailSent === false && slotUi.url && (
                    <div className="mt-2">
                      <p className="text-[11.5px] text-amber-700">
                        Mailversand nicht aktiv — Link manuell weitergeben:
                      </p>
                      <input
                        readOnly
                        value={slotUi.url}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="mt-1 w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-ink-700"
                      />
                    </div>
                  )}
                  {slotUi.emailSent === true && (
                    <p className="mt-2 text-[11.5px] text-petrol-700">
                      Freigabe-Link versendet.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
