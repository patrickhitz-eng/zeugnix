"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";

/**
 * Rendert Marketing-Header und -Footer NUR auf öffentlichen Seiten.
 * Auf /app/*, /login, /auth/callback wird beides ausgeblendet,
 * weil diese Bereiche ihr eigenes Chrome haben.
 */
export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  const hideChrome =
    pathname.startsWith("/app") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth");

  if (hideChrome) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <Header />
      <main className="min-h-[60vh]">{children}</main>
      <Footer />
    </>
  );
}
