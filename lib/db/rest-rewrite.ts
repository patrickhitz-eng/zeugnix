import { createHmac } from "node:crypto";

/**
 * Zugangstoken für die eigene Daten-API (PostgREST auf advisori01).
 *
 * Die Anwendung spricht mit der Datenbank nur über PostgREST, und PostgREST lässt nur
 * Anfragen mit einem gültigen JWT durch. Diese Datei stellt diese Token aus, kurzlebig und
 * mit dem eigenen Geheimnis DATA_API_JWT_SECRET (derselbe Wert steht als jwt-secret in
 * postgrest.conf). PostgREST liest daraus die Rolle (`anon`, `authenticated`,
 * `service_role`), und die Funktion auth.uid() in der Datenbank liest `sub`. Alle Regeln
 * der Zeilensicherheit hängen an diesen zwei Angaben.
 *
 * Bis B2 (Plan cutover-b § 8) lenkte diese Datei ausserdem die Anfragen von supabase-js
 * von der Supabase-Adresse auf DATA_API_URL um. Seit der Datenclient
 * (lib/db/supabase-server.ts) @supabase/postgrest-js direkt auf DATA_API_URL setzt, gibt
 * es nichts mehr umzulenken: Hier bleibt nur das Ausstellen der Token.
 *
 * WOHER DIE IDENTITÄT KOMMT
 *
 * Nie aus einem Cookie-Inhalt oder dem Rumpf einer Anfrage. Wer sich ein Cookie mit fremder
 * Kennung schreibt, bekäme sonst ein gültiges Token für dieses Konto. Die Identität kommt
 * aus `getSessionUser()` (lib/auth/session.ts), und die schlägt die Sitzung in
 * auth.sessions nach. Das Cookie ist dort nur der Schlüssel, unter dem nachgeschlagen wird.
 *
 * VERHALTEN OHNE KONFIGURATION
 *
 * Fehlt DATA_API_URL oder DATA_API_JWT_SECRET, gibt es einen Fehler. Einen Rückfall gibt es
 * nicht mehr: Supabase hält keine Daten mehr, und eine App ohne Datenbank soll laut
 * scheitern statt leer zu antworten. scripts/check-env.mjs fängt beides vor dem
 * Deployment ab.
 */

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
   * und braucht auch keine: `service_role` hat auf jeder Tabelle mit Zeilensicherheit
   * die Regel `service_role_alles` (supabase/901_nine_rechte.sql) und sieht damit alle
   * Zeilen.
   */
  role?: DataApiRole;
  /**
   * Auflösung der angemeldeten Person für den Benutzer-Client. MUSS aus einer geprüften
   * Quelle kommen (`getSessionUser()`), nie aus dem Cookie oder dem Anfragerumpf.
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

function configuredBase(): string | null {
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

/**
 * Adresse der eigenen Daten-API (nur Schema, Host und Port). Wirft, wenn sie fehlt: Ohne
 * sie gibt es keine Daten, und ein stiller Rückfall wäre schlimmer als ein Fehler.
 */
export function dataApiBase(): string {
  const base = configuredBase();
  if (!base) {
    throw new Error("DATA_API_URL fehlt oder ist ungültig: ohne eigene Daten-API gibt es keine Daten.");
  }
  return base;
}

function dataApiSecret(): string {
  const secret = process.env.DATA_API_JWT_SECRET?.trim();
  if (!secret) {
    // Absichtlich ein Fehler: ohne Geheimnis kein Token, und ohne Token antwortet PostgREST
    // auf jede Anfrage mit 401. scripts/check-env.mjs fängt das vor dem Deployment ab.
    throw new Error(
      "DATA_API_JWT_SECRET fehlt. Ohne eigenes Geheimnis kann kein Zugangstoken für die " +
        "Daten-API ausgestellt werden.",
    );
  }
  return secret;
}

/** Gehört die Adresse zur eigenen Daten-API? Nur dorthin darf ein Token gehen. */
function isDataApiUrl(url: string, base: string): boolean {
  return url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`);
}

/**
 * Gibt ein `fetch` für den Datenclient zurück, das jeder Anfrage an die eigene Daten-API
 * ein frisch ausgestelltes Token mitgibt. Anfragen an andere Adressen gehen unverändert
 * und ohne Token hinaus (der Datenclient stellt keine, aber ein Token gehört nie an
 * eine fremde Adresse).
 *
 * Wirft, wenn DATA_API_URL oder DATA_API_JWT_SECRET fehlt.
 */
export function createDataApiFetch(options: DataApiFetchOptions = {}): typeof fetch {
  const base = dataApiBase();
  const secret = dataApiSecret();

  // Die Identität wird pro Client einmal aufgelöst, nicht pro Anfrage: eine Route stellt
  // oft mehrere Abfragen, und die Antwort ändert sich innerhalb einer Anfrage nicht.
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

  /** Setzt das Token. Ein mitgegebener Authorization-Kopf wird ersetzt, nicht ergänzt. */
  async function headersFor(original: HeadersInit | undefined): Promise<Headers> {
    const headers = new Headers(original);
    headers.set("Authorization", `Bearer ${mintToken(await identity(), secret)}`);
    // PostgREST ignoriert apikey; ein solcher Kopf hat an der Daten-API nichts zu suchen.
    headers.delete("apikey");
    return headers;
  }

  return async function dataApiFetch(input, init) {
    try {
      if (typeof input === "string" || input instanceof URL) {
        const url = String(input);
        if (!isDataApiUrl(url, base)) return await fetch(input, init);
        return await fetch(url, { ...init, headers: await headersFor(init?.headers) });
      }

      // Request-Objekt: alles übernehmen, nur die Kopfzeilen ersetzen.
      if (!isDataApiUrl(input.url, base)) return await fetch(input, init);
      const headers = await headersFor(init?.headers ?? input.headers);
      return await fetch(new Request(input), { ...init, headers });
    } catch (error) {
      // Ein Fehler beim Ausstellen darf nie wie ein Datenbankfehler aussehen.
      console.error("[rest-rewrite] Anfrage fehlgeschlagen:", error);
      throw error;
    }
  } as typeof fetch;
}

/**
 * Direkter Zugang zur eigenen Daten-API für die Anmeldung (lib/auth/store.ts). Sie ruft
 * die auth_*-Funktionen aus supabase/906_auth_eigen.sql als service_role auf, mit einem
 * einfachen fetch – auch aus der Middleware heraus, wo jeder Umweg Zeit kostet.
 * Wirft, wenn DATA_API_URL oder DATA_API_JWT_SECRET fehlt.
 */
export function serviceDataApi(): { base: string; authorization: string } {
  const base = dataApiBase();
  const secret = dataApiSecret();
  return { base, authorization: `Bearer ${mintToken({ role: "service_role" }, secret)}` };
}

/**
 * Nur für den Gesundheitstest und die Fehlersuche: wohin gehen die Daten gerade?
 * Gibt keine Zugangsdaten zurück, nur die Adresse.
 */
export function dataApiTarget(): string {
  return configuredBase() ?? "(keine Adresse konfiguriert)";
}
