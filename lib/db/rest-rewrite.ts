import { createHmac } from "node:crypto";

/**
 * Lenkt die Datenzugriffe von supabase-js auf unsere eigene Daten-API um — und stellt
 * dafür eigene Zugangstoken aus.
 *
 * WARUM DIE UMLENKUNG NICHT ÜBER DIE URL LÄUFT
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
 * unter `/rest/v1/` geht an `DATA_API_URL`, alles andere unverändert an Supabase.
 *
 * WARUM WIR EIGENE TOKEN AUSSTELLEN
 *
 * Zuerst war geplant, einfach das Supabase-JWT-Geheimnis in PostgREST einzutragen. Dann
 * hätte die eigene Daten-API genau die Token akzeptiert, die Supabase ohnehin ausstellt.
 * Dieser Weg ist am 1. Oktober 2026 weggefallen, aus zwei unabhängigen Gründen:
 *
 *  - Die API-Schlüssel des Projekts haben das neue Format (`sb_publishable_…`,
 *    `sb_secret_…`). Das sind undurchsichtige Zeichenketten, keine JWTs. Der
 *    Service-Client schickt seinen Schlüssel als Bearer-Token — PostgREST würde ihn als
 *    JWT prüfen und jede Anfrage mit 401 abweisen.
 *  - Die Sitzungs-Token werden auf asymmetrische ES256-Schlüssel umgestellt. Ein
 *    HS256-Geheimnis gibt es damit nicht mehr dauerhaft. Das JWKS liesse sich in PostgREST
 *    nur als Datei hinterlegen (es nimmt keine URL) — bei jeder Rotation des
 *    Signaturschlüssels stünde die Daten-API still, bis jemand eine Datei kopiert.
 *
 * Die Lösung ist kleiner als beide Umwege: Die Prüfung findet schon statt, bevor wir
 * etwas tun. `supabase.auth.getUser()` fragt den Auth-Server über das Netz, und der
 * Rückgabewert ist laut Supabase-Dokumentation „authentic and can be used to base
 * authorization rules on" — unabhängig davon, mit welchem Verfahren das Token signiert
 * war. Aus dieser geprüften Identität stellen wir ein eigenes, kurzlebiges HS256-Token für
 * PostgREST aus. PostgREST sieht damit nur Token aus unserer Hand, und welcher Algorithmus
 * bei Supabase gilt, ist gleichgültig.
 *
 * WAS HIER AUSDRÜCKLICH NICHT PASSIERT
 *
 * Das eingehende Supabase-Token wird NICHT ausgelesen, um daraus `sub` zu übernehmen. Das
 * wäre der naheliegende Weg und ein Totalverlust: Das Token kommt aus einem Cookie, und
 * Cookies bestimmt der Browser. Wer sich eines mit fremdem `sub` schreibt, bekäme von uns
 * ein gültiges Token für dieses Konto. Die Identität kommt ausschliesslich aus
 * `getUser()`.
 *
 * VERHALTEN OHNE KONFIGURATION
 *
 * Ist `DATA_API_URL` leer oder nicht gesetzt, gibt `createDataApiFetch()` `undefined`
 * zurück. Die aufrufende Stelle übergibt dann kein eigenes `fetch`, und supabase-js
 * verhält sich exakt wie vorher.
 */

/** PostgREST erwartet die Tabelle direkt unter der Wurzel, ohne dieses Präfix. */
const REST_PREFIX = "/rest/v1";

/**
 * Lebensdauer der ausgestellten Token. Sie verlassen den Server nie — sie gehen über
 * 127.0.0.1 an einen Prozess auf derselben Maschine. Eine Minute ist darum keine
 * Einschränkung, begrenzt aber den Schaden, falls eines doch irgendwo landet.
 */
const TOKEN_TTL_SECONDS = 60;

export type DataApiRole = "anon" | "authenticated" | "service_role";

export interface DataApiIdentity {
  role: DataApiRole;
  /** Benutzer-ID für den Anspruch `sub`; auth.uid() in der Datenbank liest ihn. */
  sub?: string;
}

export interface DataApiFetchOptions {
  /**
   * Feste Rolle — für den Service-Client. Die Anwendung hat dort keine Benutzeridentität
   * und braucht auch keine: `service_role` besitzt die Tabellen und umgeht damit die
   * Zeilensicherheit.
   */
  role?: DataApiRole;
  /**
   * Auflösung der angemeldeten Person für den Benutzer-Client. MUSS aus einer geprüften
   * Quelle kommen (`auth.getUser()`), nie aus dem Cookie oder dem eingehenden Token.
   * Gibt `null` zurück, wenn niemand angemeldet ist — dann gilt `anon`.
   */
  resolveIdentity?: () => Promise<DataApiIdentity | null>;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Stellt ein HS256-Token aus. Das Geheimnis wird nie ausgegeben oder protokolliert. */
function mintToken(identity: DataApiIdentity, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      // jwt-aud in postgrest.conf prüft diesen Wert mit.
      aud: "authenticated",
      role: identity.role,
      ...(identity.sub ? { sub: identity.sub } : {}),
      iat: now,
      // nbf absichtlich nicht gesetzt: eine Uhrabweichung zwischen zwei Prozessen auf
      // derselben Maschine gibt es nicht, aber eine überflüssige Fehlerquelle schon.
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

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
 * Gibt ein `fetch` zurück, das Datenanfragen auf die eigene Daten-API umlenkt und dabei
 * die Zugangsdaten austauscht — oder `undefined`, wenn keine eigene Daten-API
 * konfiguriert ist.
 */
export function createDataApiFetch(options: DataApiFetchOptions = {}): typeof fetch | undefined {
  const to = dataApiBase();
  const from = supabaseOrigin();
  if (!to || !from) return undefined;

  const configuredSecret = process.env.DATA_API_JWT_SECRET?.trim();
  if (!configuredSecret) {
    // Absichtlich ein Fehler und kein stiller Rückfall auf Supabase: ein Rückfall würde
    // nach dem Umzug weiter in die alte Datenbank schreiben, und zwar geräuschlos, weil
    // beide dasselbe Schema haben. scripts/check-env.mjs fängt das vor dem Deployment ab.
    throw new Error(
      "DATA_API_URL ist gesetzt, DATA_API_JWT_SECRET fehlt. Ohne eigenes Geheimnis kann " +
        "kein Zugangstoken für die Daten-API ausgestellt werden.",
    );
  }
  // Eigener Name nach der Prüfung: `headersFor` unten ist eine Funktionsdeklaration und
  // wird hochgezogen, darum trägt TypeScript die Einengung aus dem `if` nicht hinein.
  const secret: string = configuredSecret;

  // Die Identität wird pro Client einmal aufgelöst, nicht pro Anfrage: `getUser()` ist ein
  // Netzwerkaufruf zum Auth-Server, und eine Route stellt oft mehrere Abfragen.
  let identityOnce: Promise<DataApiIdentity> | null = null;

  async function identity(): Promise<DataApiIdentity> {
    if (options.role) return { role: options.role };
    if (!options.resolveIdentity) return { role: "anon" };
    if (!identityOnce) {
      identityOnce = options
        .resolveIdentity()
        .then((resolved) => resolved ?? { role: "anon" as DataApiRole })
        .catch((error) => {
          // Lässt sich die Identität nicht klären, ist `anon` die richtige Antwort: die
          // Zeilensicherheit zeigt dann nichts. Die Alternative — im Zweifel
          // `authenticated` — wäre ein Datenleck.
          console.error("[rest-rewrite] Identität nicht auflösbar, fahre als anon:", error);
          return { role: "anon" as DataApiRole };
        });
    }
    return identityOnce;
  }

  /** Ersetzt die Zugangsdaten. Der Supabase-Schlüssel darf die Daten-API nie erreichen. */
  async function headersFor(original: HeadersInit | undefined): Promise<Headers> {
    const headers = new Headers(original);
    headers.set("Authorization", `Bearer ${mintToken(await identity(), secret)}`);
    // PostgREST ignoriert apikey, aber der Supabase-Schlüssel hat hier nichts zu suchen.
    headers.delete("apikey");
    return headers;
  }

  return async function dataApiFetch(input, init) {
    try {
      if (typeof input === "string" || input instanceof URL) {
        const target = rewriteUrl(String(input), from, to);
        if (!target) return await fetch(input, init);
        return await fetch(target, { ...init, headers: await headersFor(init?.headers) });
      }

      // Request-Objekt: Adresse tauschen, alles andere übernehmen.
      const target = rewriteUrl(input.url, from, to);
      if (!target) return await fetch(input, init);
      const headers = await headersFor(init?.headers ?? input.headers);
      return await fetch(new Request(target, input), { ...init, headers });
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
