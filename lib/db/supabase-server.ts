import { PostgrestClient } from "@supabase/postgrest-js";
import { cookies } from "next/headers";

import { getSessionUser } from "@/lib/auth/session";
import { createDataApiFetch, dataApiBase } from "./rest-rewrite";

/**
 * Datenclients für Server Components, Server Actions und Route Handler.
 *
 * Beide sprechen direkt mit der eigenen Daten-API (PostgREST auf advisori01, Adresse in
 * DATA_API_URL). Die Bibliothek ist @supabase/postgrest-js, dieselbe, die supabase-js
 * intern für `.from()` und `.rpc()` benutzt hat. Darum bleiben alle Abfragen im Code
 * Wort für Wort gleich; nur die Teile von supabase-js, die mit Supabase selbst sprachen
 * (Anmeldung, Storage), gibt es nicht mehr (B2, Plan cutover-b § 8).
 *
 * Wer angemeldet ist, sagt getSessionUser() (lib/auth/session.ts). Aus dieser geprüften
 * Identität stellt lib/db/rest-rewrite.ts pro Anfrage ein kurzlebiges Token für PostgREST
 * aus. Die Datei heisst aus historischen Gründen noch «supabase-server»; mit Supabase hat
 * sie nichts mehr zu tun.
 */

/**
 * Der Datenclient. Ohne Datenbank-Typen (wie bisher mit supabase-js): Spalten sind `any`.
 * `schema: "public"` setzt supabase-js ebenfalls, darum gehen dieselben Kopfzeilen
 * (Accept-Profile/Content-Profile) an PostgREST wie vorher.
 */
export type DataClient = PostgrestClient<any, any, "public", any>;

function dataClient(fetch: typeof globalThis.fetch): DataClient {
  return new PostgrestClient(dataApiBase(), { schema: "public", fetch }) as DataClient;
}

/**
 * Client im Namen der angemeldeten Person. Die Zeilensicherheit in der Datenbank
 * entscheidet, was sie sieht: angemeldet als `authenticated` mit ihrer ID, sonst `anon`.
 *
 * Die Person für eine Anfrage nie aus einem Cookie oder dem Anfragerumpf ableiten,
 * sondern immer über getSessionUser().
 */
export async function createClient(): Promise<DataClient> {
  // Bindet den Client sofort an die Anfrage, wie bis Cutover B der Supabase-Weg es tat.
  // Ohne diese Zeile fiele `cookies()` erst bei der ersten Abfrage an, in
  // getSessionUser(). Beim Vorrendern im Build ist das ein Signal an Next («diese Seite
  // ist dynamisch»), und rest-rewrite.ts würde es als «Identität nicht auflösbar»
  // abfangen und die Abfrage als anon gegen die Datenbank schicken. So bricht Next das
  // Vorrendern ab, bevor eine Abfrage hinausgeht.
  await cookies();
  return dataClient(
    createDataApiFetch({
      resolveIdentity: async () => {
        const user = await getSessionUser();
        return user ? { role: "authenticated", sub: user.id } : null;
      },
    }),
  );
}

/**
 * Service-Client für Operationen, die die Zeilensicherheit umgehen müssen
 * (z. B. Einladungs-Token prüfen, Cleanup, Widerruf). Feste Rolle `service_role`, keine
 * Benutzeridentität. NUR auf dem Server verwenden.
 *
 * Rückgabetyp bewusst `any`, genau wie vorher: supabase-js wurde hier per `require`
 * geladen, und alle Aufrufer sind ohne Typprüfung der Zeilen geschrieben (z. B.
 * zusammengesetzte select-Texte, die der Typ-Parser von postgrest-js ablehnt). Das zu
 * typisieren ist ein eigener Schritt, nicht Teil von B2.
 */
export function createServiceClient(): any {
  return dataClient(createDataApiFetch({ role: "service_role" }));
}
