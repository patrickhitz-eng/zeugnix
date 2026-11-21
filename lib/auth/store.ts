import { serviceDataApi } from "@/lib/db/rest-rewrite";

/**
 * zeugnio – Zugriff auf die Anmelde-Tabellen (nur eigene Anmeldung)
 * ----------------------------------------------------------------------------
 * Ruft die Funktionen aus supabase/906_auth_eigen.sql über PostgREST auf, als
 * service_role und über 127.0.0.1. Die Tabellen selbst (auth.login_requests,
 * auth.sessions) sind von aussen nicht erreichbar; nur diese Funktionen, und
 * die nur mit service_role.
 *
 * Hier gehen ausschliesslich HMAC-Werte hinaus, nie ein Token oder Code im
 * Klartext (lib/auth/tokens.ts).
 *
 * Bewusst ohne supabase-js: Die Middleware schlägt bei jeder Anfrage auf eine
 * App-Seite die Sitzung nach, und ein einfacher fetch ist dort der kürzeste
 * Weg. Nach dem Aufräumen (Plan § 8, B2) bleibt diese Datei unverändert.
 */

export interface StoredUser {
  id: string;
  email: string;
}

const RPC_TIMEOUT_MS = 3000;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const api = serviceDataApi();
  if (!api) {
    throw new Error("Eigene Anmeldung ohne DATA_API_URL: die Anmelde-Tabellen liegen nur auf advisori01.");
  }
  const res = await fetch(`${api.base}/rpc/${name}`, {
    method: "POST",
    headers: {
      Authorization: api.authorization,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Der Rumpf einer PostgREST-Fehlermeldung enthält nie die Argumente; trotzdem
    // nur Status und Code ins Protokoll, nicht den ganzen Text.
    let code = "";
    try {
      code = ((await res.json()) as { code?: string }).code ?? "";
    } catch {
      // kein JSON
    }
    throw new Error(`[auth] ${name} fehlgeschlagen: HTTP ${res.status}${code ? ` (${code})` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type UserRow = { user_id: string; email: string };

function firstUser(rows: UserRow[] | null | undefined): StoredUser | null {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row?.user_id ? { id: row.user_id, email: row.email } : null;
}

/** Legt eine Anforderung an. true = Mail schicken (Konto vorhanden oder Registrierung offen). */
export async function storeLoginRequest(input: {
  email: string;
  linkHmac: string;
  codeHmac: string;
  signupOpen: boolean;
}): Promise<boolean> {
  const result = await rpc<boolean>("auth_request_login", {
    p_email: input.email,
    p_link_hmac: input.linkHmac,
    p_code_hmac: input.codeHmac,
    p_signup_open: input.signupOpen,
  });
  return result === true;
}

export async function redeemLink(input: {
  linkHmac: string;
  sessionHmac: string;
  signupOpen: boolean;
}): Promise<StoredUser | null> {
  return firstUser(
    await rpc<UserRow[]>("auth_redeem_link", {
      p_link_hmac: input.linkHmac,
      p_token_hmac: input.sessionHmac,
      p_signup_open: input.signupOpen,
    }),
  );
}

export async function redeemCode(input: {
  email: string;
  codeHmac: string;
  sessionHmac: string;
  signupOpen: boolean;
}): Promise<StoredUser | null> {
  return firstUser(
    await rpc<UserRow[]>("auth_redeem_code", {
      p_email: input.email,
      p_code_hmac: input.codeHmac,
      p_token_hmac: input.sessionHmac,
      p_signup_open: input.signupOpen,
    }),
  );
}

/** Person zur Sitzung. `renewed`: die Sitzung wurde eben verlängert, das Cookie soll mit. */
export async function lookupSession(sessionHmac: string): Promise<(StoredUser & { renewed: boolean }) | null> {
  const rows = await rpc<(UserRow & { renewed: boolean })[]>("auth_session_user", {
    p_token_hmac: sessionHmac,
  });
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row?.user_id ? { id: row.user_id, email: row.email, renewed: row.renewed === true } : null;
}

export async function endSession(sessionHmac: string): Promise<void> {
  await rpc<void>("auth_end_session", { p_token_hmac: sessionHmac });
}

/** Beendet alle Sitzungen einer Person (Konto löschen). Gibt die Anzahl zurück. */
export async function endAllSessions(userId: string): Promise<number> {
  const count = await rpc<number>("auth_end_all_sessions", { p_user_id: userId });
  return typeof count === "number" ? count : 0;
}

/**
 * Adresse zu einem offenen Link, ohne ihn zu verbrauchen (Seite /auth/link,
 * Schutz gegen Login-CSRF). null = unbekannt, verbraucht oder abgelaufen.
 */
export async function linkEmail(linkHmac: string): Promise<string | null> {
  const email = await rpc<string | null>("auth_link_email", { p_link_hmac: linkHmac });
  return typeof email === "string" && email !== "" ? email : null;
}
