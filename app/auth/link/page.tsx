import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { authMode, authSecret } from "@/lib/auth/config";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { linkEmail } from "@/lib/auth/store";
import { hmac, isTokenShape, maskEmail } from "@/lib/auth/tokens";
import { logError } from "@/lib/log";

/**
 * /auth/link?t=…&next=…
 *
 * Ziel des Links in der Anmelde-Mail (eigene Anmeldung). Diese Seite VERBRAUCHT
 * NICHTS. Sie zeigt nur einen Knopf; erst das Formular (POST /api/auth/link)
 * löst den Link ein. Grund: Linkscanner wie Microsoft Defender Safe Links rufen
 * jeden Link vorab auf (GET). Würde schon dieser Aufruf einlösen, wäre der Link
 * tot, bevor der Mensch klickt.
 *
 * Vor dem Knopf steht die Adresse, für die der Link gilt, teilweise verdeckt
 * (Review PR #91, Login-CSRF). Ohne diese Anzeige könnte jemand einer Person
 * den Link zum eigenen Konto schicken; sie meldete sich ahnungslos dort an und
 * legte ihre Zeugnisse im fremden Konto ab. Das Nachschlagen liest nur
 * (auth_link_email), es verbraucht nichts.
 *
 * Das Token steht in der Adresse dieser Seite. Darum gilt hier
 * `Referrer-Policy: no-referrer` (next.config.mjs und Metadaten unten): Ein
 * Klick auf «Neuen Code anfordern» schickte sonst die volle Adresse samt
 * Token als Referer mit, und der landete im Zugriffsprotokoll von nginx.
 *
 * `force-dynamic` ist Pflicht: Unter /auth vergibt die Middleware eine
 * CSP-Nonce, und nur eine pro Anfrage gerenderte Seite kann sie tragen
 * (siehe app/auth/callback/page.tsx, PR #27).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anmelden",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type LinkState = { kind: "offen"; masked: string } | { kind: "ungueltig" } | { kind: "fehler" };

async function linkState(t: string | undefined): Promise<LinkState> {
  if (!isTokenShape(t)) return { kind: "ungueltig" };
  try {
    const email = await linkEmail(hmac(authSecret(), "link", t));
    return email ? { kind: "offen", masked: maskEmail(email) } : { kind: "ungueltig" };
  } catch (error) {
    logError("[auth] Link nicht nachschlagbar:", error);
    return { kind: "fehler" };
  }
}

export default async function AuthLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; next?: string }>;
}) {
  if (authMode() !== "eigen") redirect("/login");

  const { t, next } = await searchParams;
  const state = await linkState(t);

  return (
    <section className="bg-white">
      <div className="container-zx flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center py-16">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-[18px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
        </div>

        <h1 className="headline-display mt-12 text-center text-[28px] leading-tight">Anmelden</h1>

        {state.kind === "offen" ? (
          <>
            <p className="mt-3 text-center text-[14px] text-ink-600">Dieser Link meldet Sie an als</p>
            <p className="mt-1 text-center text-[16px] font-medium text-ink-900">{state.masked}</p>
            <p className="mt-3 text-center text-[13px] text-ink-500">
              Ist das nicht Ihre Adresse, klicken Sie nicht auf «Anmelden» und schliessen Sie diese Seite.
            </p>
            <form method="post" action="/api/auth/link" className="mt-10">
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="next" value={sanitizeNext(next)} />
              <button type="submit" className="btn-primary w-full">
                Anmelden
              </button>
            </form>
          </>
        ) : state.kind === "fehler" ? (
          <div className="mt-8 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-[13px] text-red-700">
            Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es in ein paar Minuten erneut.
          </div>
        ) : (
          <div className="mt-8 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-[13px] text-red-700">
            Dieser Link ist abgelaufen, wurde schon verwendet oder ist unvollständig. Bitte fordern Sie einen neuen
            Code an.
          </div>
        )}

        <p className="mt-6 text-center text-[12px] text-ink-500">
          <Link href="/login" className="underline hover:text-petrol-700">
            Neuen Code anfordern
          </Link>
        </p>
      </div>
    </section>
  );
}
