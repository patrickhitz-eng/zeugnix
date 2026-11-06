/**
 * zeugnio – Client-IP hinter dem Proxy
 * ----------------------------------------------------------------------------
 * Gebraucht für Rate-Limits und als Beleg einer Unterzeichner-Freigabe
 * (`confirmed_ip`). Darum zählt nur, was der eigene Proxy setzt:
 *
 * - `x-real-ip` setzen Vercel und der nginx auf advisori01 (nine) auf die
 *   Gegenstelle der TCP-Verbindung, also die echte Adresse.
 * - `x-forwarded-for` bringt der Browser schon mit; der Proxy hängt die echte
 *   Adresse nur HINTEN an. Der ERSTE Eintrag lässt sich darum frei fälschen,
 *   als Ersatz taugt nur der LETZTE.
 *
 * Bis zum Umzug nahm zeugnio den ersten Eintrag. Auf Vercel war das harmlos,
 * weil Vercel den Kopf neu schreibt; hinter nginx wäre jedes Rate-Limit mit
 * einem erfundenen Kopf zu umgehen (Fahrplan Marktstart, Schritt 27). Gleiches
 * Muster wie Albis Run (`src/lib/requestInfo.ts`).
 *
 * Eigenes Modul ohne Server-Abhängigkeiten, damit `npm run test:client-ip` es
 * direkt laden kann. `lib/rate-limit.ts` reicht es unverändert weiter.
 */
export function getClientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const last = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last || "unknown";
}
