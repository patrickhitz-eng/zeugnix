/**
 * zeugnio – Herkunftsprüfung für alle schreibenden API-Anfragen
 * ----------------------------------------------------------------------------
 * Die Middleware ruft das für jede Anfrage auf. Bisher prüften nur die
 * Anmelde-Routen unter /api/auth/* den `Origin`-Kopf (lib/auth/origin.ts).
 * Alle anderen schreibenden Routen verliessen sich allein auf SameSite=Lax am
 * Sitzungs-Cookie. Das hält gegen fremde Seiten, solange es keine fremde
 * Subdomain gibt; eine zweite Schicht kostet hier aber nur einen Vergleich.
 *
 * Der Mechanismus: Ein Browser setzt bei jeder Anfrage, die nicht GET oder
 * HEAD ist, den Kopf `Origin` selbst (bei fetch() auch innerhalb derselben
 * Seite). Eine fremde Seite kann ihn weder weglassen noch fälschen. Steht dort
 * nicht die eigene Adresse, kommt die Anfrage nicht von zeugnio.
 *
 * Fehlt `Origin` ganz (sehr alte Browser), zählt ersatzweise der `Referer`.
 * Fehlen beide, wird abgelehnt. «null» (Sandbox, file://, Weiterleitung über
 * fremde Seiten) gilt als fremd. Werkzeuge ohne Browser (curl, Skripte)
 * schicken keinen Origin; für sie gibt es heute keine schreibende API. Wer
 * eine solche Route braucht, trägt sie unten als Ausnahme ein, mit eigener
 * Prüfung (Geheimnis, Signatur).
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:api-origin` es direkt laden
 * kann.
 */
import { isAllowedOrigin } from "./auth/origin";

/** Methoden, die nichts ändern dürfen und darum ohne Prüfung durchgehen. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Ausnahmen: Routen, die ein anderer Server aufruft, nie ein Browser. Sie
 * prüfen den Absender selbst.
 *
 * - /api/cron/: der Tagesjob auf advisori01 (deploy/nine/cron-pii-cleanup.mjs),
 *   mit dem Geheimnis CRON_SECRET. Heute nur GET, die Ausnahme hält auch für
 *   einen späteren POST.
 * - /api/stripe/webhook: Stripe ruft ihn auf, ohne Origin. Heute stillgelegt
 *   (501). Die echte Umsetzung muss die Stripe-Signatur über den Rohtext
 *   prüfen, bevor sie etwas auslöst.
 *
 * Bewusst KEINE Ausnahme sind die öffentlichen Routen ohne Konto:
 * /api/verify, /api/verify/hash, /api/analyze (Prüfseite),
 * /api/evaluations/submit (Seite der vorgesetzten Person),
 * /api/signoffs/[token]/submit (Freigabeseite). Sie alle werden nur von den
 * eigenen Seiten per fetch() aufgerufen, also immer mit eigenem Origin.
 * Auch /api/auth/* bleibt drin: Die Routen prüfen selbst noch einmal gleich.
 */
export const ORIGIN_EXEMPT_PREFIXES: readonly string[] = ["/api/cron/", "/api/stripe/webhook"];

/** Muss diese Anfrage ihre Herkunft nachweisen? */
export function needsOriginCheck(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (path !== "/api" && !path.startsWith("/api/")) return false;
  return !ORIGIN_EXEMPT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}

export type OriginVerdict = "ok" | "fehlt" | "fremd";

/**
 * Entscheidet über die Herkunft. `allowed` kommt aus allowedOrigins()
 * (lib/auth/origin.ts), dieselbe Liste wie bei den Anmelde-Routen.
 */
export function judgeOrigin(input: {
  origin: string | null;
  referer: string | null;
  allowed: readonly string[];
}): OriginVerdict {
  // Origin vorhanden (auch «null»): Er allein entscheidet.
  if (input.origin !== null) return isAllowedOrigin(input.origin, input.allowed) ? "ok" : "fremd";
  if (!input.referer) return "fehlt";
  let refererOrigin: string;
  try {
    refererOrigin = new URL(input.referer).origin;
  } catch {
    return "fremd";
  }
  return isAllowedOrigin(refererOrigin, input.allowed) ? "ok" : "fremd";
}
