"use client";

import { useState } from "react";
import { createClient } from "@/lib/db/supabase-client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-petrol-200 bg-petrol-50 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-petrol-100">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-petrol-700"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h3 className="mt-4 text-[15px] font-medium">E-Mail gesendet</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          Wir haben Ihnen einen Anmelde-Link an{" "}
          <span className="font-medium text-ink-900">{email}</span> geschickt.
          Klicken Sie den Link, um sich anzumelden.
        </p>
        <p className="mt-4 text-[12px] text-ink-500">
          E-Mail nicht erhalten? Prüfen Sie den Spam-Ordner oder fordern Sie
          einen{" "}
          <button
            onClick={() => setStatus("idle")}
            className="underline hover:text-petrol-700"
          >
            neuen Link
          </button>{" "}
          an.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[13px] font-medium text-ink-800"
        >
          E-Mail-Adresse
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ihre@firma.ch"
          className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
        />
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="btn-primary w-full disabled:opacity-50"
      >
        {status === "sending" ? "Wird gesendet…" : "Magic Link senden"}
      </button>
    </form>
  );
}
