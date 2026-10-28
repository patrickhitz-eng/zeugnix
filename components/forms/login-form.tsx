"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, createOtpClient } from "@/lib/db/supabase-client";
import { siteConfig } from "@/lib/site-config";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { finishLogin } from "@/lib/auth/finish-login";

/**
 * Anmeldung mit zwei gleichwertigen Wegen aus derselben E-Mail:
 *
 *   1. Magic-Link anklicken  -> /auth/callback
 *   2. 6-stelligen Code hier eintippen -> verifyOtp()
 *
 * Der zweite Weg ist der Grund für diese Datei: Link-Scanner in
 * Microsoft-365-Postfächern (Defender Safe Links) rufen den Link in der Mail
 * vorab auf. Zeigt er auf Supabases /auth/v1/verify, löst dieser GET den
 * einmaligen Token bereits ein – klickt die Empfängerin danach, ist er
 * verbraucht. Ein Code, der eingetippt werden muss, kann von keinem Scanner
 * verbraucht werden.
 *
 * WICHTIG: Code und Link stammen aus demselben Token. Beide Wege funktionieren
 * nur dann gemeinsam, wenn die Supabase-Mailvorlage auf {{ .TokenHash }} gegen
 * die eigene Domain zeigt statt auf {{ .ConfirmationURL }}. Sonst verbrennt der
 * Scanner über den Link auch den Code.
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
  /** Adresse ohne Konto, Registrierung geschlossen → Weg zur Kontaktseite zeigen. */
  const [noAccount, setNoAccount] = useState(false);
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
    setNoAccount(false);

    const supabase = createOtpClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        // Registrierung nur auf Einladung (siehe lib/site-config.ts): unbekannte
        // Adressen bekommen keine Mail, Supabase antwortet mit einem Fehler.
        // Serverseitig sperrt erst die Dashboard-Einstellung «Allow new users
        // to sign up» – dieser Parameter kommt aus dem Browser und ist
        // umgehbar. Kehrseite: Die Antwort verrät, ob eine Adresse ein Konto
        // hat; für einen geschlossenen Kundenkreis vertretbar.
        shouldCreateUser: siteConfig.signup.open,
      },
    });

    if (error) {
      setStatus("error");
      setNoAccount(isSignupBlocked(error.message));
      setErrorMsg(loginErrorText(error.message));
    } else {
      try {
        sessionStorage.setItem(EMAIL_KEY, email);
      } catch {
        // Siehe useEffect – ohne Speicher läuft der Weg trotzdem.
      }
      setStatus("sent");
    }
  }

  /** Schritt 2a: Code eintippen. Der Link in der Mail bleibt parallel gültig. */
  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setErrorMsg("");

    // Hier der SSR-Client, nicht createOtpClient: verifyOtp muss die Session in
    // die Cookies schreiben, damit die Middleware sie sieht. createOtpClient
    // schreibt bewusst keinen Zustand.
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;

      await finishLogin(safeNext);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.";
      setStatus("sent");
      setErrorMsg(loginErrorText(raw));
    }
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
                className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
              />
            </div>
          )}

          <label
            htmlFor="code"
            className="block text-[13px] font-medium text-ink-800"
          >
            Code aus der E-Mail
          </label>
          {/* maxLength bewusst 10, nicht 6: Supabase gibt je nach Einstellung
              6 bis 10 Stellen aus, und ein zu enges Feld schneidet einen
              längeren Code ab – eintippen wäre dann unmöglich. */}
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
            className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-center text-[18px] tracking-[0.3em] text-ink-900 outline-none transition-colors placeholder:tracking-[0.3em] placeholder:text-ink-400 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
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
          className="w-full rounded-md border border-ink-200 bg-white px-4 py-3 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100"
        />
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {errorMsg}
          {noAccount && (
            <>
              {" "}
              <Link
                href={siteConfig.signup.cta.href}
                className="font-medium underline underline-offset-2"
              >
                {siteConfig.signup.cta.label}
              </Link>
            </>
          )}
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

/**
 * Übersetzt die englischen Supabase-Auth-Fehler in Sätze, aus denen die
 * Anmeldende ablesen kann, was sie jetzt tun soll.
 *
 * Unübersetzte Fälle fallen auf den Originaltext zurück – lieber englisch und
 * vollständig als deutsch und irreführend.
 */
function loginErrorText(raw: string): string {
  const r = raw.toLowerCase();

  if (isSignupBlocked(raw)) {
    return "Für diese E-Mail-Adresse besteht noch kein Zugang. Während der Pilotphase richten wir Zugänge persönlich ein.";
  }

  if (r.includes("rate limit") || r.includes("too many")) {
    return "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment, bevor Sie einen neuen Code anfordern.";
  }

  // Supabase liefert für "Code vertippt" und "Token war schon verbraucht"
  // denselben Text (otp_expired / token has expired or is invalid). Die beiden
  // sind technisch nicht zu trennen, also deckt ein Satz beide Ursachen ab und
  // führt in beiden Fällen zur selben richtigen Handlung: neuen Code anfordern.
  // "Abgelaufen" allein wäre falsch, wenn nur vertippt wurde; "falscher Code"
  // wäre falsch, wenn ein Linkscanner den Token verbraucht hat.
  if (r.includes("expired") || r.includes("invalid")) {
    return "Dieser Code ist nicht mehr gültig – entweder vertippt, oder der Link in der E-Mail wurde bereits geöffnet. Bitte fordern Sie einen neuen Code an.";
  }

  return raw;
}

/**
 * Supabase meldet eine unbekannte Adresse bei geschlossener Registrierung als
 * "Signups not allowed for otp" (shouldCreateUser:false) bzw. "Signups not
 * allowed for this instance" (Dashboard-Sperre).
 */
function isSignupBlocked(raw: string): boolean {
  const r = raw.toLowerCase();
  return r.includes("signup") && r.includes("not allowed");
}
