import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { TermsAcceptForm } from "@/components/forms/terms-accept-form";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { TERMS_LABEL, TERMS_VERSION } from "@/lib/legal/terms";

export const metadata = { title: "AGB annehmen" };

/**
 * /app/zustimmung – AGB-Zustimmung vor dem Arbeitsbereich (Fahrplan
 * Marktstart, Schritt 11).
 *
 * Liegt bewusst in (public) und nicht unter dem App-Layout: Das Layout schickt
 * hierher, wer noch nicht zugestimmt hat, und würde sich sonst selbst
 * umleiten. Eingeloggt sein muss man trotzdem – das erzwingen die Middleware
 * (alles unter /app ausser /app/invitations) und die Prüfung unten.
 */
export default async function ZustimmungPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  let safeNext = sanitizeNext(next);
  if (safeNext.startsWith("/app/zustimmung")) safeNext = "/app/dashboard";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Schon angenommen (z.B. zweiter Tab) → direkt weiter.
  const { data: acceptance } = await supabase
    .from("terms_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .eq("terms_version", TERMS_VERSION)
    .maybeSingle();
  if (acceptance) redirect(safeNext);

  return (
    <section className="bg-white">
      <div className="container-zx flex min-h-screen max-w-md flex-col justify-center py-16">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-[18px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
        </div>

        <h1 className="headline-display mt-12 text-center text-[28px] leading-tight">
          Noch ein Schritt
        </h1>
        <p className="mt-3 text-center text-[14px] leading-relaxed text-ink-600">
          Bevor Sie Zeugnisse erstellen, bitten wir Sie, unseren AGB zuzustimmen.
          Wir speichern, welche Fassung Sie wann angenommen haben.
        </p>

        <div className="mt-10">
          <TermsAcceptForm version={TERMS_VERSION} label={TERMS_LABEL} next={safeNext} />
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-[12px] text-ink-500">
          <span>Angemeldet als {user.email}.</span>
          <SignOutButton />
        </div>
      </div>
    </section>
  );
}
