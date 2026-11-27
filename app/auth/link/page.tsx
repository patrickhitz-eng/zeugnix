import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { authSecret } from "@/lib/auth/config";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { getSessionUser } from "@/lib/auth/session";
import { linkEmail } from "@/lib/auth/store";
import { hmac, isTokenShape, maskEmail, needsSwitchConfirm, SWITCH_CONFIRM_VALUE } from "@/lib/auth/tokens";
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
 * Ist dieser Browser schon mit einem ANDEREN Konto angemeldet, wechselte der
 * Link still das Konto. Dann zeigt die Seite beide Konten («Sie sind angemeldet
 * als …», «dieser Link meldet Sie an als …») und verlangt ein Häkchen.
 * POST /api/auth/link prüft dasselbe noch einmal und löst ohne Häkchen nicht
 * ein. Die eigene Adresse steht dabei ausgeschrieben: Sie kommt aus dem
 * Sitzungs-Cookie, ein Linkscanner hat keines und sieht sie nie.
 *
 * Das Token steht in der Adresse dieser Seite. Darum gilt hier
 * `Referrer-Policy: strict-origin` (next.config.mjs und Metadaten unten): Ein
 * Klick auf «Neuen Code anfordern» schickte sonst die volle Adresse samt
 * Token als Referer mit, und der landete im Zugriffsprotokoll von nginx. Mit
 * strict-origin geht nur «https://zeugnio.ch» mit. Nicht «no-referrer»: Dann
 * schickt der Browser beim Absenden des Formulars `Origin: null`, und
 * POST /api/auth/link lehnt die Anmeldung als fremde Herkunft ab.
 *
 * `force-dynamic` ist Pflicht: Unter /auth vergibt die Middleware eine
 * CSP-Nonce, und nur eine pro Anfrage gerenderte Seite kann sie tragen
 * (siehe scripts/check-nonce-routes.mjs, PR #27).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anmelden",
  robots: { index: false, follow: false },
  referrer: "strict-origin",
};

type LinkState =
  | { kind: "offen"; masked: string }
  | { kind: "wechsel"; masked: string; current: string }
  | { kind: "ungueltig" }
  | { kind: "fehler" };

async function linkState(t: string | undefined): Promise<LinkState> {
  if (!isTokenShape(t)) return { kind: "ungueltig" };
  try {
    const email = await linkEmail(hmac(authSecret(), "link", t));
    if (!email) return { kind: "ungueltig" };
    const current = await getSessionUser();
    if (needsSwitchConfirm(current, email)) {
      return { kind: "wechsel", masked: maskEmail(email), current: current?.email ?? "(Adresse unbekannt)" };
    }
    return { kind: "offen", masked: maskEmail(email) };
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
        ) : state.kind === "wechsel" ? (
          <>
            <p className="mt-3 text-center text-[14px] text-ink-600">Sie sind angemeldet als</p>
            <p className="mt-1 break-all text-center text-[16px] font-medium text-ink-900">{state.current}</p>
            <p className="mt-5 text-center text-[14px] text-ink-600">Dieser Link meldet Sie an als</p>
            <p className="mt-1 text-center text-[16px] font-medium text-ink-900">{state.masked}</p>
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Das ist ein anderes Konto. Haben Sie diesen Link nicht selbst angefordert, wechseln Sie nicht: Sie
              würden danach im Konto einer anderen Person arbeiten, und was Sie erfassen, läge dort.
            </div>
            <form method="post" action="/api/auth/link" className="mt-8">
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="next" value={sanitizeNext(next)} />
              <label className="flex items-start gap-2 text-[14px] text-ink-700">
                <input
                  type="checkbox"
                  name="bestaetigt"
                  value={SWITCH_CONFIRM_VALUE}
                  required
                  className="mt-1"
                />
                <span>Ja, ich will zum Konto {state.masked} wechseln.</span>
              </label>
              <button type="submit" className="btn-primary mt-6 w-full">
                Konto wechseln
              </button>
            </form>
            <p className="mt-4 text-center text-[13px]">
              <Link href="/app/dashboard" className="underline hover:text-petrol-700">
                Abbrechen und angemeldet bleiben
              </Link>
            </p>
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
