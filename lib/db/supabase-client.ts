"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-seitiger Supabase-Client für Client Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
