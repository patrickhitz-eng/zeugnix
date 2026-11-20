/**
 * zeugnio – Herkunftsprüfung für die Anmelde-Routen (Plan § 6.6)
 * ----------------------------------------------------------------------------
 * Jede POST-Anfrage an /api/auth/* muss einen `Origin`-Kopf tragen, der genau
 * der eigenen Adresse entspricht. Browser setzen diesen Kopf bei POST selbst,
 * und eine fremde Seite kann ihn nicht fälschen. Zusammen mit SameSite=Lax am
 * Cookie verhindert das untergeschobene Formulare von fremden Seiten (CSRF),
 * etwa ein unsichtbares Formular, das jemanden in ein fremdes Konto anmeldet.
 *
 * Fehlt der Kopf oder steht dort «null» (Sandbox, file://), wird abgelehnt.
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:auth` es direkt laden kann.
 */

export function isAllowedOrigin(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin || origin === "null") return false;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  // new URL("https://zeugnio.ch/pfad").origin würde einen Pfad still entfernen;
  // ein echter Origin-Kopf hat nie einen. Darum zusätzlich der wörtliche Vergleich.
  if (normalized !== origin) return false;
  return allowed.includes(normalized);
}

/**
 * Erlaubte Ursprünge: die eigene Adresse aus NEXT_PUBLIC_SITE_URL, und nur in
 * der Entwicklung zusätzlich die Adresse, unter der der Dev-Server läuft.
 */
export function allowedOrigins(input: {
  siteOrigin: string;
  requestOrigin: string;
  production: boolean;
}): string[] {
  return input.production ? [input.siteOrigin] : [input.siteOrigin, input.requestOrigin];
}
