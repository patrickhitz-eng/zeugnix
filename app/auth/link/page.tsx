import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { authMode } from "@/lib/auth/config";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { isTokenShape } from "@/lib/auth/tokens";

/**
 * /auth/link?t=…&next=…
 *
 * Ziel des Links in der Anmelde-Mail (eigene Anmeldung). Diese Seite VERBRAUCHT
 * NICHTS. Sie zeigt nur einen Knopf; erst das Formular (POST /api/auth/link)
 * löst den Link ein. Grund: Linkscanner wie Microsoft Defender Safe Links rufen
 * jeden Link vorab auf (GET). Würde schon dieser Aufruf einlösen, wäre der Link
 * tot, bevor der Mensch klickt.
 *
 * `force-dynamic` ist Pflicht: Unter /auth vergibt die Middleware eine
 * CSP-Nonce, und nur eine pro Anfrage gerenderte Seite kann sie tragen
 * (siehe app/auth/callback/page.tsx, PR #27).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anmelden",
  robots: { index: false, follow: false },
};

export default async function AuthLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; next?: string }>;
}) {
  if (authMode() !== "eigen") redirect("/login");

  const { t, next } = await searchParams;
  const valid = isTokenShape(t);

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

        {valid ? (
          <>
            <p className="mt-3 text-center text-[14px] text-ink-600">
              Klicken Sie auf «Anmelden», um sich auf diesem Gerät anzumelden.
            </p>
            <form method="post" action="/api/auth/link" className="mt-10">
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="next" value={sanitizeNext(next)} />
              <button type="submit" className="btn-primary w-full">
                Anmelden
              </button>
            </form>
          </>
        ) : (
          <div className="mt-8 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-[13px] text-red-700">
            Dieser Link ist unvollständig. Bitte öffnen Sie ihn direkt aus der E-Mail oder fordern Sie einen neuen
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
