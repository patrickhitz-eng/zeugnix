import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { authMode } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { createDataApiFetch } from "./rest-rewrite";

/**
 * Server-seitiger Supabase-Client für Server Components, Server Actions
 * und Route Handlers. Liest und schreibt Auth-Cookies automatisch.
 *
 * Ist DATA_API_URL gesetzt, gehen die Datenzugriffe (/rest/v1/…) an die eigene
 * Daten-API auf demselben Server, die Anmeldung weiterhin an Supabase. Ist die
 * Variable leer, verhält sich alles wie vorher – siehe lib/db/rest-rewrite.ts.
 *
 * Mit der eigenen Anmeldung (ZEUGNIO_AUTH=eigen, Cutover B) ist dieser Client
 * nur noch ein Datenclient: keine Supabase-Cookies, keine Sitzung, kein
 * Auffrischen bei Supabase. Wer angemeldet ist, sagt getSessionUser()
 * (lib/auth/session.ts). Die Person für eine Anfrage NIE über
 * `supabase.auth.getUser()` erfragen, sondern immer über getSessionUser().
 */
export async function createClient(): Promise<SupabaseClient> {
  if (authMode() === "eigen") return createEigenDataClient();

  const cookieStore = await cookies();

  // Der Fetch-Wrapper braucht die GEPRÜFTE Identität. Er fragt erst bei der ersten
  // Datenanfrage nach, und zwar bei getSessionUser(): Das ist derselbe Aufruf von
  // `supabase.auth.getUser()` (Netzwerkaufruf zum Auth-Server, die einzige belastbare
  // Quelle; das Cookie selbst ist keine, siehe lib/db/rest-rewrite.ts), aber nur einmal
  // pro Anfrage gemerkt (lib/auth/request-memo.ts). Vorher fragte jeder Datenclient
  // selbst bei Supabase nach, zusätzlich zur Route.
  const dataFetch = createDataApiFetch({
    resolveIdentity: async () => {
      const user = await getSessionUser();
      return user ? { role: "authenticated", sub: user.id } : null;
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

  return client as unknown as SupabaseClient;
}

/**
 * Datenclient für die eigene Anmeldung. Die Identität für PostgREST kommt aus
 * getSessionUser(), also aus auth.sessions, nicht aus einem Cookie-Inhalt.
 * Ohne Supabase-Cookies kann supabase-js auch keine alte Sitzung bei Supabase
 * auffrischen wollen: nach Tag B geht von hier keine Anfrage mehr an Supabase.
 */
function createEigenDataClient(): SupabaseClient {
  const dataFetch = createDataApiFetch({
    resolveIdentity: async () => {
      const user = await getSessionUser();
      return user ? { role: "authenticated", sub: user.id } : null;
    },
  });
  if (!dataFetch) {
    // Ohne eigene Daten-API gäbe es keine Anmeldetabellen, und ein Rückfall auf
    // Supabase schriebe still in die alte Datenbank. check-env fängt das ab.
    throw new Error("ZEUGNIO_AUTH=eigen braucht DATA_API_URL (eigene Daten-API auf advisori01).");
  }
  return createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: dataFetch },
  });
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
