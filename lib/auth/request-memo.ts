/**
 * zeugnio – Ergebnis einmal pro Anfrage merken
 * ----------------------------------------------------------------------------
 * Im Modus ZEUGNIO_AUTH=supabase kostet «wer ist angemeldet?» einen Aufruf von
 * supabase.auth.getUser() nach Frankfurt. Eine Anfrage stellt die Frage aber
 * mehrmals: die Route selbst (getSessionUser) und jeder Datenclient, bevor er
 * das Token für PostgREST ausstellt. Vor dem Review von PR #91 waren das pro
 * API-Aufruf mindestens zwei Netzaufrufe.
 *
 * React `cache()` hilft nur beim Darstellen von Server Components, nicht in
 * Route Handlern. Darum hier ein eigener Speicher:
 *
 *   - Schlüssel ist ein Objekt, das es nur einmal pro Anfrage gibt (der
 *     Cookie-Speicher von Next). Eine WeakMap hält es nicht fest; ist die
 *     Anfrage vorbei, verschwindet der Eintrag mit.
 *   - Dazu eine Signatur, bei der Anmeldung die Werte der Supabase-Cookies.
 *     Ändern sie sich innerhalb der Anfrage (Sitzung aufgefrischt, Abmelden),
 *     wird neu gefragt.
 *
 * Warum das sicher ist: Das Ergebnis hängt nur an diesen Cookies, und der
 * Eintrag gilt nur für genau den Speicher, aus dem sie stammen. Teilten sich
 * zwei Anfragen je denselben Cookie-Speicher, wäre schon die Anmeldung selbst
 * falsch, mit oder ohne diese Datei.
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:auth` es prüfen kann.
 */
export function createRequestMemo<V>() {
  const entries = new WeakMap<object, { signature: string; value: V }>();
  return function remember(owner: object, signature: string, compute: () => V): V {
    const hit = entries.get(owner);
    if (hit && hit.signature === signature) return hit.value;
    const value = compute();
    entries.set(owner, { signature, value });
    return value;
  };
}

/**
 * Signatur der Supabase-Anmeldung aus den Cookies: Name und Wert aller
 * `sb-…`-Cookies, sortiert. Leer heisst: kein Supabase-Cookie, also sicher
 * nicht angemeldet, und es braucht gar keinen Aufruf.
 */
export function supabaseCookieSignature(all: { name: string; value: string }[]): string {
  return all
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => `${c.name}=${c.value}`)
    .sort()
    .join(";");
}

/**
 * Trägt der Browser ein Supabase-Sitzungscookie? (`sb-<projekt>-auth-token`,
 * gestückelt auch `.0`, `.1` …; nicht das `-code-verifier`-Cookie, das nur
 * während einer Anmeldung kurz besteht.) Nur für Anzeigen gedacht, siehe
 * app/api/auth/status/route.ts: Gültig ist die Sitzung damit noch nicht.
 */
export function hasSupabaseSessionCookie(all: { name: string }[]): boolean {
  return all.some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
}
