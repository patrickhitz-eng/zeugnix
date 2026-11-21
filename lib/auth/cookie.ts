import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./config";

/**
 * zeugnio – das Sitzungs-Cookie der eigenen Anmeldung
 * ----------------------------------------------------------------------------
 * Ein einziges Cookie, `__Host-zeugnio_session`. Es enthält nur die zufällige
 * Sitzungskennung (32 Byte), keine Person, keine Adresse, keine Rolle. Wer
 * angemeldet ist, steht ausschliesslich in auth.sessions (Plan § 6.3).
 *
 *   HttpOnly       kein Skript im Browser kann es lesen (Schutz bei XSS)
 *   Secure         nur über HTTPS (localhost gilt als sicher)
 *   SameSite=Lax   fremde Seiten schicken es bei POST nicht mit (CSRF)
 *   Path=/         Pflicht für das Präfix __Host-; kein Domain-Attribut
 *   Max-Age        30 Tage, bei Nutzung erneuert (Entscheid E2)
 *
 * Ohne Server-Abhängigkeiten, damit `npm run test:auth` es prüfen kann.
 */

export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  };
}

export function sessionCookie(token: string): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

/** Löscht das Cookie: gleiche Attribute, leerer Wert, Max-Age 0. */
export function clearedSessionCookie(): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 },
  };
}
