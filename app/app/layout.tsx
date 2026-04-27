import { createClient } from "@/lib/db/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";

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
        <div className="container-zx flex h-14 items-center justify-between">
          <Link href="/app/dashboard" className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-medium tracking-tight">
              zeugnix
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

      <div className="container-zx grid gap-8 py-8 lg:grid-cols-12">
        {/* Sidebar */}
        <aside className="lg:col-span-3">
          <nav className="space-y-1">
            <NavItem href="/app/dashboard" label="Übersicht" />
            <NavItem href="/app/certificates" label="Zeugnisse" />
            <NavItem href="/app/certificates/new" label="Neues Zeugnis" />
            <NavItem href="/app/company" label="Firma" />
          </nav>
        </aside>

        {/* Content */}
        <main className="lg:col-span-9">{children}</main>
      </div>
    </div>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-[13.5px] font-medium text-ink-700 transition-colors hover:bg-white hover:text-petrol-700"
    >
      {label}
    </Link>
  );
}
