import { LoginForm } from "@/components/forms/login-form";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { sanitizeNext } from "@/lib/auth/sanitize-next";

export const metadata = {
  title: "Anmelden",
  description: "Anmelden bei zeugnio.ch via Magic Link",
};

const ERROR_MESSAGES: Record<string, string> = {
  setup_incomplete:
    "Die Anmeldung ist noch nicht eingerichtet. Bitte versuchen Sie es später erneut.",
  service_unavailable:
    "Der Anmeldedienst ist momentan nicht erreichbar. Bitte versuchen Sie es in ein paar Minuten erneut.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const safeNext = sanitizeNext(next);

  // Bereits eingeloggte Nutzer nicht nochmal das Formular sehen lassen.
  // Defensiv: Login-Seite darf nie crashen, auch wenn Supabase nicht
  // erreichbar/konfiguriert ist (gleiches Prinzip wie middleware.ts).
  // WICHTIG: redirect() wirft intern (NEXT_REDIRECT) und darf deshalb nicht
  // im try-Block stehen, sonst würde der catch-Block den Redirect schlucken.
  let alreadyLoggedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    alreadyLoggedIn = !!user;
  } catch {
    // Supabase nicht erreichbar -> einfach das Login-Formular zeigen.
  }
  if (alreadyLoggedIn) redirect(safeNext);

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? `Anmeldung über den Link fehlgeschlagen: ${error}`)
    : null;

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

        <h1 className="headline-display mt-12 text-center text-[28px] leading-tight">
          Anmelden
        </h1>
        <p className="mt-3 text-center text-[14px] text-ink-600">
          Wir senden Ihnen einen Magic Link an Ihre E-Mail-Adresse.
          <br />
          Kein Passwort nötig.
        </p>

        {errorMessage && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-[12.5px] text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-10">
          <LoginForm next={next} />
        </div>

        <p className="mt-8 text-center text-[12px] text-ink-500">
          Mit der Anmeldung stimmen Sie unseren{" "}
          <Link href="/legal/terms" className="underline">
            AGB
          </Link>{" "}
          und der{" "}
          <Link href="/legal/privacy" className="underline">
            Datenschutzerklärung
          </Link>{" "}
          zu.
        </p>
      </div>
    </section>
  );
}
