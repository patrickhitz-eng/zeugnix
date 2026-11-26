"use client";

import { useEffect, useState } from "react";
import { sanitizeNext } from "@/lib/auth/sanitize-next";

/**
 * Anmeldung mit zwei gleichwertigen Wegen aus derselben E-Mail:
 *
 *   1. Link anklicken  -> /auth/link (Seite mit Knopf, löst erst beim Absenden ein)
 *   2. 6-stelligen Code hier eintippen -> POST /api/auth/code
 *
 * Angefordert wird die Mail über POST /api/auth/anfordern. Die Antwort ist für
 * jede Adresse gleich (Entscheid E3), darum gibt es hier keinen Hinweis «kein
 * Konto».
 *
 * Warum zwei Wege: Link-Scanner in Microsoft-365-Postfächern (Defender Safe
 * Links) rufen den Link in der Mail vorab auf. Darum verbraucht /auth/link beim
 * Aufruf nichts, und der Code kommt ganz ohne Link aus (Plan cutover-b § 3).
 */
/** Schlüssel für die zwischengespeicherte Adresse. Nur diese eine Angabe. */
const EMAIL_KEY = "zeugnio:login-email";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "verifying" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  /**
   * Zeigt die Code-Eingabe, ohne vorher eine Mail angefordert zu haben. Nötig,
   * weil der Status "sent" ein Neuladen nicht überlebt: wer anfordert, auf die
   * verzögerte Mail wartet und zwischenzeitlich die Seite neu lädt, hätte sonst
   * einen gültigen Code in der Mail und kein Feld dafür.
   */
  const [showCodeEntry, setShowCodeEntry] = useState(false);

  const safeNext = sanitizeNext(next);

  // Die Adresse überlebt ein Neuladen, damit dann nur noch der Code fehlt.
  // sessionStorage statt localStorage: mit dem Tab ist sie wieder weg.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // Privater Modus oder blockierter Speicher – dann wird die Adresse
      // einmal mehr eingegeben, mehr passiert nicht.
    }
  }, []);

  /** Schritt 1: Mail anfordern. */
  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    // Die Antwort ist für jede Adresse gleich (Entscheid E3).
    const res = await fetch("/api/auth/anfordern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next: safeNext }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setStatus("error");
      setErrorMsg(body?.error ?? "Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es erneut.");
      return;
    }
    try {
      sessionStorage.setItem(EMAIL_KEY, email);
    } catch {
      // Siehe useEffect – ohne Speicher läuft der Weg trotzdem.
    }
    setStatus("sent");
  }

  /** Schritt 2a: Code eintippen. Der Link in der Mail bleibt parallel gültig. */
  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setErrorMsg("");

    const res = await fetch("/api/auth/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: code.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      // Harter Seitenwechsel, damit die Middleware das neue Cookie sieht.
      window.location.assign(safeNext);
      return;
    }
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setStatus("sent");
    setErrorMsg(body?.error ?? "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.");
  }

  // Nur wahr, wenn in diesem Besuch gerade eine Mail rausging. Beim direkten
  // Einstieg über "Ich habe bereits einen Code" bleibt es falsch, auch während
  // der Prüfung – sonst stünde dort plötzlich "E-Mail gesendet".
  const justSent =
    !showCodeEntry && (status === "sent" || status === "verifying");

  if (justSent || showCodeEntry) {
    return (
      <div className="rounded-lg border border-petrol-200 bg-petrol-50 p-6">
        <div className="text-center">
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
          <h3 className="mt-4 text-[15px] font-medium">
            {justSent ? "E-Mail gesendet" : "Code eingeben"}
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
            {justSent ? (
              <>
                An <span className="font-medium text-ink-900">{email}</span>.
                Klicken Sie den Link in der E-Mail – oder geben Sie den Code
                daraus hier ein.
              </>
            ) : (
              "Geben Sie den Code aus der Anmelde-E-Mail ein."
            )}
          </p>
        </div>

        <form onSubmit={onVerify} className="mt-5 space-y-3">
          {!justSent && (
            <div>
              <label
                htmlFor="code-email"
                className="mb-1.5 block text-[13px] font-medium text-ink-800"
              >
                E-Mail-Adresse
              </label>
              <input
                id="code-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@firma.ch"
                className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-500 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
              />
            </div>
          )}

          <label
            htmlFor="code"
            className="block text-[13px] font-medium text-ink-800"
          >
            Code aus der E-Mail
          </label>
          {/* maxLength 10 stammt aus der Zeit von Supabase Auth (6 bis 10
              Stellen). Die eigene Anmeldung schickt immer 6 Ziffern; das
              weitere Feld schadet nicht, die Form prüft der Server
              (isCodeShape in lib/auth/tokens.ts). */}
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
            placeholder="123456"
            className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-center text-[18px] tracking-[0.3em] text-ink-900 outline-none transition-colors placeholder:tracking-[0.3em] placeholder:text-ink-500 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
          />

          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={
              status === "verifying" || code.trim().length < 6 || !email
            }
            className="btn-primary w-full disabled:opacity-50"
          >
            {status === "verifying" ? "Wird geprüft…" : "Anmelden"}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-ink-500">
          Keine E-Mail erhalten? Prüfen Sie den Spam-Ordner oder fordern Sie
          einen{" "}
          <button
            onClick={() => {
              setStatus("idle");
              setShowCodeEntry(false);
              setCode("");
              setErrorMsg("");
            }}
            className="underline hover:text-petrol-700"
          >
            neuen Code
          </button>{" "}
          an.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onRequest} className="space-y-4">
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
          className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-500 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
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
        {status === "sending" ? "Wird gesendet…" : "Anmelde-Code senden"}
      </button>

      {/* Einstieg für alle, die bereits eine Mail haben, deren Seite aber neu
          geladen wurde. Ohne diesen Weg müssten sie eine zweite Mail anfordern
          und würden die erste – mit noch gültigem Code – liegen lassen. */}
      <p className="text-center text-[12px] text-ink-500">
        <button
          type="button"
          onClick={() => {
            setShowCodeEntry(true);
            setErrorMsg("");
          }}
          className="underline hover:text-petrol-700"
        >
          Ich habe bereits einen Code
        </button>
      </p>
    </form>
  );
}
