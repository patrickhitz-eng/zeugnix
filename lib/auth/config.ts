/**
 * zeugnio – feste Werte der Anmeldung
 * ----------------------------------------------------------------------------
 * zeugnio meldet seit Cutover B (23.11.2026) selbst an: Code oder Link per
 * Mail, Sitzung in auth.sessions auf advisori01 (Plan
 * .claude/plans/2026-10-30-cutover-b-eigene-anmeldung.md). Den Schalter
 * ZEUGNIO_AUTH, mit dem bis dahin Supabase Auth anmeldete, gibt es seit B2
 * nicht mehr. Steht er noch in einer .env, liest ihn niemand;
 * scripts/check-env.mjs weist darauf hin.
 *
 * Die Anmeldung braucht die eigene Daten-API (DATA_API_URL) und
 * ZEUGNIO_AUTH_SECRET. scripts/check-env.mjs prüft beides vor dem Deployment.
 *
 * Eigenes Modul ohne Server-Abhängigkeiten, damit `npm run test:auth` es direkt
 * laden kann.
 */

/**
 * Name des Sitzungs-Cookies. Das Präfix `__Host-` lässt der Browser nur zu,
 * wenn das Cookie `Secure` ist, kein `Domain` trägt und `Path=/` hat. So kann
 * keine Subdomain (test.zeugnio.ch o. ä.) es überschreiben oder unterschieben.
 * Auf http://localhost klappt es trotzdem: Browser behandeln localhost als
 * sicheren Ursprung.
 */
export const SESSION_COOKIE = "__Host-zeugnio_session";

/** Gleich wie auth.session_ttl() in supabase/906_auth_eigen.sql (Entscheid E2). */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Gleich wie auth.login_ttl() und auth.login_max_tries() in 906. */
export const LOGIN_TTL_MINUTES = 15;
export const LOGIN_MAX_TRIES = 5;

/**
 * Ratenbegrenzung (Plan § 6.5). Das Limit pro Adresse schützt fremde
 * Postfächer davor, mit Anmelde-Mails zugemüllt zu werden; das Limit pro IP
 * bremst Durchprobieren.
 */
export const RATE_LIMITS = {
  anfordernProAdresse: { limit: 5, windowMs: 60 * 60 * 1000 },
  anfordernProIp: { limit: 20, windowMs: 60 * 60 * 1000 },
  einloesenProIp: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

/** Mindestlänge des Geheimnisses: 32 Zeichen (Plan § 5, check-env prüft mit). */
export const AUTH_SECRET_MIN_LENGTH = 32;

/**
 * Das Geheimnis für alle HMAC-Werte. Fehlt es, bricht die Anmeldung mit einem
 * Fehler ab, statt ohne Geheimnis weiterzumachen: ein leerer Schlüssel machte
 * aus dem HMAC einen einfachen Hash, und die 6-stelligen Codes wären aus einem
 * Datenbankauszug in Sekunden durchprobiert.
 */
export function authSecret(): string {
  const secret = process.env.ZEUGNIO_AUTH_SECRET?.trim() ?? "";
  if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `ZEUGNIO_AUTH_SECRET fehlt oder ist kürzer als ${AUTH_SECRET_MIN_LENGTH} Zeichen. ` +
        "Ohne Geheimnis läuft die eigene Anmeldung nicht.",
    );
  }
  return secret;
}

/**
 * Die Adresse, die in die Anmelde-Mail kommt. Bewusst NICHT aus der Anfrage
 * (Host, X-Forwarded-Host): Wer den Kopf fälscht, bekäme sonst einen Link auf
 * die eigene Seite in das Postfach einer fremden Person, und mit dem ersten
 * Klick dort das Anmelde-Token.
 */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // ungültig: Vorgabe unten
    }
  }
  return "https://zeugnio.ch";
}
