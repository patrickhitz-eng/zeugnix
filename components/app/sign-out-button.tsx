"use client";

import { createClient } from "@/lib/db/supabase-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="text-[12.5px] font-medium text-ink-700 hover:text-petrol-700"
    >
      Abmelden
    </button>
  );
}
