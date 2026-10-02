import AuthCallbackClient from "./callback-client";

/**
 * /auth/callback
 *
 * Diese Datei enthält absichtlich keine Logik. Ihr einziger Zweck ist die Zeile
 * `dynamic = "force-dynamic"` darunter, und die ist nicht optional:
 *
 * Die Middleware vergibt für /app, /login, /verify, /auth und /api eine
 * CSP-Nonce und setzt dazu 'strict-dynamic'. Bei 'strict-dynamic' ignoriert der
 * Browser 'self' für Skripte – erlaubt ist dann nur noch, was die Nonce trägt.
 * Die Nonce entsteht aber pro Anfrage und kann nur in eine Seite gelangen, die
 * pro Anfrage gerendert wird.
 *
 * Als Client Component ohne diese Angabe wurde /auth/callback statisch
 * vorgerendert (`○` in der Build-Ausgabe). Das HTML entstand damit beim Build,
 * lange vor der ersten Nonce – die Script-Tags trugen keine, und der Browser
 * blockierte das gesamte JavaScript der Seite. Sichtbar wurde das nicht als
 * CSP-Meldung, sondern als fehlgeschlagene Anmeldung: genau diese Seite tauscht
 * den Magic-Link gegen eine Sitzung. Der Weg führte ins Leere, und der Fehler
 * zeigte auf Supabase, obwohl Supabase nichts dafür konnte.
 *
 * Für eine Seite, die ein Anmelde-Token verarbeitet, ist dynamisches Rendern
 * ohnehin das Richtige – zwischengespeichert werden darf sie nie.
 *
 * Prüfen lässt sich das in der Build-Ausgabe: diese Route muss `ƒ (Dynamic)`
 * sein, nicht `○ (Static)`.
 */
export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
