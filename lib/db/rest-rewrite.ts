/**
 * Lenkt die Datenzugriffe von supabase-js auf unsere eigene Daten-API um — und nur die.
 *
 * WARUM SO UND NICHT ÜBER DIE URL
 *
 * Der naheliegende Weg wäre, `NEXT_PUBLIC_SUPABASE_URL` auf die eigene Adresse zu setzen.
 * Das wäre ein Fehler mit zwei Folgen, und beide fallen erst im Betrieb auf:
 *
 *  1. supabase-js leitet aus dieser EINEN Basis-Adresse *alle* Endpunkte ab — also auch
 *     `/auth/v1` (Anmeldung) und `/storage/v1`. Unsere Daten-API kennt nur die Tabellen.
 *     Jede Anmeldung liefe damit in ein 404.
 *  2. Der Name des Sitzungs-Cookies wird aus dem ersten Label des Hostnamens gebildet
 *     (`sb-<label>-auth-token`). Eine neue Adresse heisst also neuer Cookie-Name, und das
 *     entwertet in derselben Sekunde stillschweigend jede bestehende Anmeldung.
 *
 * Darum bleibt die Supabase-Adresse stehen und nur der Datenpfad wird umgelenkt: alles
 * unter `/rest/v1/` geht an `DATA_API_URL`, alles andere unverändert an Supabase. Damit
 * lässt sich der Umzug in zwei getrennte Schritte teilen — zuerst die Daten, später die
 * Anmeldung — und keiner der beiden zwingt die Kundschaft, sich neu anzumelden.
 *
 * VERHALTEN OHNE KONFIGURATION
 *
 * Ist `DATA_API_URL` leer oder nicht gesetzt, gibt `createDataApiFetch()` `undefined`
 * zurück. Die aufrufende Stelle übergibt dann kein eigenes `fetch`, und supabase-js
 * verhält sich exakt wie vorher. Diese Datei ist also bis zum Cutover wirkungslos — das
 * ist beabsichtigt, so kann sie vorher in Ruhe eingebaut und getestet werden.
 */

/** PostgREST erwartet die Tabelle direkt unter der Wurzel, ohne dieses Präfix. */
const REST_PREFIX = "/rest/v1";

function dataApiBase(): string | null {
  const raw = process.env.DATA_API_URL?.trim();
  if (!raw) return null;
  try {
    // Ein Schrägstrich am Ende würde beim Zusammensetzen einen doppelten ergeben.
    return new URL(raw).origin;
  } catch {
    console.error("[rest-rewrite] DATA_API_URL ist keine gültige Adresse – ignoriert.");
    return null;
  }
}

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Baut die Zieladresse, falls diese Anfrage eine Datenanfrage an Supabase ist.
 * Gibt `null` zurück, wenn nichts umzulenken ist — dann läuft die Anfrage unverändert.
 */
function rewriteUrl(url: string, from: string, to: string): string | null {
  if (!url.startsWith(from)) return null;
  const rest = url.slice(from.length);
  if (!rest.startsWith(`${REST_PREFIX}/`) && rest !== REST_PREFIX) return null;
  return to + rest.slice(REST_PREFIX.length);
}

/**
 * Gibt ein `fetch` zurück, das Datenanfragen auf die eigene Daten-API umlenkt, oder
 * `undefined`, wenn keine eigene Daten-API konfiguriert ist.
 *
 * Wird an `createServerClient`/`createClient` als `global.fetch` übergeben. supabase-js
 * ruft es mit einer Zeichenkette und einem Options-Objekt auf; die Request-Variante ist
 * nur der Vollständigkeit halber behandelt.
 */
export function createDataApiFetch(): typeof fetch | undefined {
  const to = dataApiBase();
  const from = supabaseOrigin();
  if (!to || !from) return undefined;

  return async function dataApiFetch(input, init) {
    try {
      if (typeof input === "string" || input instanceof URL) {
        const target = rewriteUrl(String(input), from, to);
        return await fetch(target ?? input, init);
      }

      // Request-Objekt: Adresse tauschen, alles andere übernehmen.
      const target = rewriteUrl(input.url, from, to);
      if (!target) return await fetch(input, init);
      return await fetch(new Request(target, input), init);
    } catch (error) {
      // Ein Fehler im Umlenken darf nie wie ein Datenbankfehler aussehen.
      console.error("[rest-rewrite] Anfrage fehlgeschlagen:", error);
      throw error;
    }
  } as typeof fetch;
}

/**
 * Nur für den Gesundheitstest und die Fehlersuche: wohin gehen die Daten gerade?
 * Gibt keine Zugangsdaten zurück, nur die Adresse.
 */
export function dataApiTarget(): string {
  return dataApiBase() ?? supabaseOrigin() ?? "(keine Adresse konfiguriert)";
}
