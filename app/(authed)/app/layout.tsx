import { createClient } from "@/lib/db/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { AppNav } from "@/components/app/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-ink-50/30">
      {/* Top Bar */}
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link href="/app/dashboard" className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-[12px] text-ink-500 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1500px] gap-8 px-6 py-8 sm:px-8 lg:grid-cols-12 lg:px-12">
        {/* Sidebar */}
        <aside className="lg:col-span-2">
          <AppNav />
        </aside>

        {/* Content */}
        <main className="lg:col-span-10">{children}</main>
      </div>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col items-start gap-2 px-6 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p>© {new Date().getFullYear()} zeugnio. Schweizer Arbeitszeugnis-Plattform.</p>
          <div className="flex gap-4">
            <Link href="/legal/imprint" className="hover:text-petrol-700">
              Impressum
            </Link>
            <Link href="/legal/privacy" className="hover:text-petrol-700">
              Datenschutz
            </Link>
            <Link href="/legal/terms" className="hover:text-petrol-700">
              AGB
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
