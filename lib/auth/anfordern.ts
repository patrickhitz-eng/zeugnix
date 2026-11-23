import { LOGIN_TTL_MINUTES } from "./config";
import { codeHmac, hmac, isPlausibleEmail, newCode, newToken, normalizeEmail } from "./tokens";

/**
 * zeugnio – Ablauf «Anmelde-Mail anfordern», ohne Server-Abhängigkeiten
 * ----------------------------------------------------------------------------
 * Die Route app/api/auth/anfordern/route.ts reicht hier Datenbank, Mail und
 * Ratenbegrenzung hinein. So lässt sich die wichtigste Zusage dieser Route
 * ohne Server prüfen (`npm run test:auth`):
 *
 *   Die Antwort ist für jede Adresse gleich, ob es dazu ein Konto gibt oder
 *   nicht (Plan § 6.4, Entscheid E3).
 *
 * Gleich heisst: gleicher Status, gleicher Rumpf, und auch gleiche Dauer. Die
 * Mail geht darum erst NACH der Antwort hinaus (`schedule`, in der Route
 * `after()` von Next.js). Sonst wäre die Antwort für bekannte Adressen um die
 * Dauer des Mailversands langsamer, und das liesse sich messen.
 */

export interface AnfordernDeps {
  secret: string;
  signupOpen: boolean;
  /** Basis für den Link in der Mail, fest aus NEXT_PUBLIC_SITE_URL. */
  siteOrigin: string;
  clientIp: string;
  /** true = erlaubt. */
  rateLimit: (key: string, kind: "adresse" | "ip") => Promise<boolean>;
  /** true = Mail schicken (Konto vorhanden oder Registrierung offen). */
  storeRequest: (input: { email: string; linkHmac: string; codeHmac: string; signupOpen: boolean }) => Promise<boolean>;
  sendLoginMail: (input: { to: string; linkUrl: string; code: string }) => Promise<void>;
  /** Führt die Arbeit nach der Antwort aus. */
  schedule: (task: () => Promise<void>) => void;
}

export interface AnfordernResult {
  status: number;
  body: Record<string, unknown>;
}

/** Die eine Antwort für jede gültige Adresse. */
export const ANFORDERN_OK: AnfordernResult = Object.freeze({
  status: 200,
  body: Object.freeze({ ok: true }) as Record<string, unknown>,
});

/** Antwort bei 429. Gleich für das Limit pro IP und pro Adresse, verrät also nichts über Konten. */
export const ANFORDERN_ZU_VIELE =
  `Zu viele Anfragen in kurzer Zeit. Eine bereits erhaltene Anmelde-Mail bleibt ${LOGIN_TTL_MINUTES} Minuten gültig. ` +
  "Sonst bitte etwas später erneut versuchen.";

export async function handleAnfordern(
  input: { email: unknown; next: unknown },
  deps: AnfordernDeps,
): Promise<AnfordernResult> {
  const raw = typeof input.email === "string" ? input.email : "";
  const email = normalizeEmail(raw);
  if (!isPlausibleEmail(email)) {
    // Verrät nichts über Konten: es geht nur um die Schreibweise.
    return { status: 400, body: { error: "Bitte eine gültige E-Mail-Adresse eingeben." } };
  }

  // Ratenbegrenzung erst pro IP, dann pro Adresse. Die Adresse geht nur als
  // HMAC in den Zähler, nicht im Klartext in die Tabelle rate_limits.
  //
  // Die Reihenfolge ist Absicht (Review PR #91): Wer von einer IP aus schon über
  // dem Limit ist, verbraucht das Kontingent der Adresse nicht mehr. Vorher
  // zählten beide Zähler bei jeder Anfrage, auch bei abgelehnten, und eine
  // fremde Person konnte von einer einzigen IP aus das Limit einer Adresse
  // aufbrauchen. Das Limit pro Adresse bleibt nötig: Es schützt das Postfach
  // vor einer Flut von Anmelde-Mails.
  //
  // Wer trotzdem auf das Limit pro Adresse trifft, ist nicht ausgesperrt: Jede
  // Anforderung der letzten Viertelstunde hat eine gültige Mail in das
  // Postfach gelegt, und ältere Mails verfallen nicht mehr durch neue
  // (906, auth_request_login).
  const ipOk = await deps.rateLimit(`auth:anfordern:ip:${deps.clientIp}`, "ip");
  const mailOk =
    ipOk &&
    (await deps.rateLimit(`auth:anfordern:mail:${hmac(deps.secret, "ratelimit", email).slice(0, 32)}`, "adresse"));
  if (!ipOk || !mailOk) {
    return { status: 429, body: { error: ANFORDERN_ZU_VIELE } };
  }

  const token = newToken();
  const code = newCode();
  const shouldSend = await deps.storeRequest({
    email,
    linkHmac: hmac(deps.secret, "link", token),
    codeHmac: codeHmac(deps.secret, email, code),
    signupOpen: deps.signupOpen,
  });

  if (shouldSend) {
    const next = typeof input.next === "string" ? input.next : "";
    const params = new URLSearchParams({ t: token });
    if (next) params.set("next", next);
    const linkUrl = `${deps.siteOrigin}/auth/link?${params.toString()}`;
    deps.schedule(() => deps.sendLoginMail({ to: email, linkUrl, code }));
  }

  return { status: ANFORDERN_OK.status, body: { ...ANFORDERN_OK.body } };
}
