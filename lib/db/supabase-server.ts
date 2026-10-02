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

  // Der Fetch-Wrapper braucht die GEPRÜFTE Identität, und die liefert ausgerechnet der
  // Client, den er selbst bedient. Darum dieser Platzhalter: er wird gesetzt, sobald der
  // Client steht, und der Wrapper fragt erst bei der ersten Datenanfrage nach – dann ist
  // er längst gefüllt. `getUser()` ist ein Netzwerkaufruf zum Auth-Server und damit die
  // einzige belastbare Quelle; das Cookie selbst ist keine (siehe lib/db/rest-rewrite.ts).
  let self: ReturnType<typeof createServerClient> | null = null;

  const dataFetch = createDataApiFetch({
    resolveIdentity: async () => {
      if (!self) return null;
      const { data, error } = await self.auth.getUser();
      if (error || !data.user) return null;
      return { role: "authenticated", sub: data.user.id };
    },
  });

  const client = createServerClient(
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

  self = client;
  return client;
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
  // Feste Rolle, keine Benutzeridentität: service_role besitzt die Tabellen und umgeht
  // damit die Zeilensicherheit. Der Supabase-Schlüssel erreicht die eigene Daten-API nie –
  // er ist im neuen Format ohnehin kein JWT und würde dort mit 401 abgewiesen.
  const dataFetch = createDataApiFetch({ role: "service_role" });
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
