import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createDataApiFetch } from "./rest-rewrite";

/**
 * Server-seitiger Supabase-Client für Server Components, Server Actions
 * und Route Handlers. Liest und schreibt Auth-Cookies automatisch.
 *
 * Ist DATA_API_URL gesetzt, gehen die Datenzugriffe (/rest/v1/…) an die eigene
 * Daten-API auf demselben Server, die Anmeldung weiterhin an Supabase. Ist die
 * Variable leer, verhält sich alles wie vorher – siehe lib/db/rest-rewrite.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const dataFetch = createDataApiFetch();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(dataFetch ? { global: { fetch: dataFetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-Role-Client für Operationen, die RLS umgehen müssen
 * (z.B. Manager-Invitation-Token-Validierung, Webhook-Verarbeitung).
 * NUR auf Server-Seite verwenden – NIEMALS Service Key zum Client schicken.
 */
export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  }

  const { createClient } = require("@supabase/supabase-js");
  const dataFetch = createDataApiFetch();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Auch der Service-Client muss umgelenkt werden, sonst schreiben Widerruf,
      // PII-Cleanup und Webhooks nach dem Cutover weiter in die alte Datenbank –
      // und zwar geräuschlos, weil beide Datenbanken dasselbe Schema haben.
      ...(dataFetch ? { global: { fetch: dataFetch } } : {}),
    },
  );
}
