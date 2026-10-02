"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/supabase-client";
import { sanitizeNext } from "@/lib/auth/sanitize-next";

/**
 * Der Browser-Teil von /auth/callback.
 *
 * Die Seite daneben (page.tsx) erzwingt dynamisches Rendern. Das ist keine
 * Kosmetik: statisch vorgerendert trägt diese Seite keine CSP-Nonce, und
 * 'strict-dynamic' blockiert dann ihr gesamtes JavaScript – die Anmeldung
 * bleibt stehen, ohne dass etwas rot wird.
 *
 * Verarbeitet den Magic-Link-Rücksprung von Supabase im BROWSER. Unterstützt
 * mehrere Varianten – in dieser Reihenfolge:
 *
 *   1. Implicit-Flow:  #access_token=...&refresh_token=...  -> setSession
 *      (Standard bei uns – Tokens kommen direkt im URL-Fragment, kein
 *       PKCE-Verifier nötig, robust gegen Domain-/Geräte-Wechsel.)
 *   2. OTP-Verify:     ?token_hash=...&type=...             -> verifyOtp
 *   3. PKCE:           ?code=...                            -> exchangeCodeForSession
 *
 * Nach Erfolg: harter Reload auf das Ziel, damit die Middleware die frisch
 * gesetzten Session-Cookies sofort sieht.
 */
export default function AuthCallbackClient() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const next = sanitizeNext(query.get("next"));

    // Fehler kann in Query ODER Fragment stehen (z.B. abgelaufener Link)
    const urlError =
      query.get("error_description") ||
      query.get("error") ||
      hash.get("error_description") ||
      hash.get("error");

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const tokenHash = query.get("token_hash");
    const type = query.get("type") as EmailOtpType | null;

    (async () => {
      const supabase = createClient();
      try {
        if (urlError) {
          throw new Error(decodeURIComponent(urlError));
        }

        if (accessToken && refreshToken) {
          // Implicit-Flow (Standard): Tokens kommen im URL-Fragment.
          // setSession schreibt sie in die SSR-Cookies -> App-weit eingeloggt.
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && type) {
          // token_hash-Weg (greift, sobald die E-Mail-Vorlage darauf umgestellt
          // ist, z.B. nach Resend-Einrichtung).
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
        } else {
          throw new Error("Der Link enthält keine Anmeldedaten.");
        }

        // Die Sitzung steht. Solange die Daten noch bei Supabase liegen, ist
        // dieser Aufruf wirkungslos und antwortet mit "übersprungen". Danach
        // trägt er die Person in die eigene auth.users ein – ohne diesen Eintrag
        // greift der Fremdschlüssel von public.profiles nicht, und das Konto
        // bliebe leer. Siehe app/api/auth/sync/route.ts.
        const sync = await fetch("/api/auth/sync", { method: "POST" });
        if (!sync.ok) {
          const body = (await sync.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            body.error ??
              "Die Anmeldung hat funktioniert, das Konto konnte aber nicht fertig " +
                "eingerichtet werden. Bitte noch einmal versuchen.",
          );
        }

        window.location.assign(next);
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.";
        setError(msg);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-[16px] font-medium text-ink-900">
              Anmeldung fehlgeschlagen
            </h1>
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
            <a
              href="/login"
              className="mt-4 inline-block text-[13px] text-petrol-700 underline hover:text-petrol-800"
            >
              Neuen Link anfordern
            </a>
          </>
        ) : (
          <p className="text-[14px] text-ink-600">
            Anmeldung wird abgeschlossen…
          </p>
        )}
      </div>
    </div>
  );
}
