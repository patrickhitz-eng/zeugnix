import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";

/**
 * Durable Rate-Limiter (H5) mit In-Memory-Fallback.
 * ----------------------------------------------------------------------------
 * Primärer Pfad: Supabase-RPC `check_rate_limit` (supabase/023_rate_limit_
 * durable.sql) — ein geteilter Zähler-Store, der über alle Lambda-/Server-
 * Instanzen hinweg gilt (festes statt gleitendes Zeitfenster; Durability vor
 * Präzision an der Fensterkante). Bewusst kein neuer Anbieter (Redis/
 * Upstash) — bleibt "gratis" wie im Werkstatt-Board gelabelt.
 *
 * Fallback: schlägt die RPC fehl (Migration noch nicht deployed, Netzwerk-
 * problem), fällt rateLimit() auf den ursprünglichen In-Memory-Sliding-
 * Window-Zähler zurück, statt Requests hart durchzulassen oder zu blockieren.
 * Der Fallback-Zustand lebt im Prozessspeicher EINER Instanz — kein global
 * verteilter Schutz, aber besser als kein Limit.
 */

/** Zeitstempel (ms) der jüngsten Treffer eines Schlüssels. */
type Bucket = number[];

const store = new Map<string, Bucket>();

// Backstop gegen unbegrenztes Wachstum der Map (viele verschiedene IPs):
// gelegentlich tote Buckets aufräumen.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000;

function maybeSweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, hits] of store) {
    const last = hits[hits.length - 1];
    if (last === undefined || now - last > MAX_BUCKET_AGE_MS) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Sekunden bis zum nächsten erlaubten Versuch (nur gesetzt, wenn !ok). */
  retryAfter?: number;
}

/**
 * In-Memory-Sliding-Window – Fallback-Implementierung, siehe Modul-Kommentar
 * oben. Prüft und registriert einen Zugriff auf `key`. Erlaubt höchstens
 * `limit` Treffer innerhalb von `windowMs`. Alte Treffer altern beim Zugriff
 * selbst aus.
 */
function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    // gefilterte (gealterte) Liste zurückschreiben, ohne neuen Treffer
    store.set(key, hits);
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  hits.push(now);
  store.set(key, hits);
  return { ok: true };
}

/**
 * Prüft und registriert einen Zugriff auf `key`. Erlaubt höchstens `limit`
 * Treffer innerhalb von `windowMs`. Versucht zuerst den durable Supabase-Store
 * (check_rate_limit-RPC, festes Zeitfenster); bei jedem Fehler (Migration
 * noch nicht deployed, Netzwerkproblem) Fallback auf `rateLimitInMemory`.
 */
// Obergrenze für den RPC-Roundtrip: schlägt Supabase (nicht nur die RPC,
// sondern die Verbindung selbst) fehl oder hängt, sollen öffentliche
// Endpunkte (verify/analyze) nicht unbegrenzt lange auf den Rate-Limit-Check
// warten – lieber schnell auf den In-Memory-Fallback wechseln.
const RPC_TIMEOUT_MS = 1500;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`check_rate_limit RPC Timeout nach ${ms}ms`)), ms),
  );
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  try {
    const supabase = createServiceClient();
    const { data, error } = await Promise.race([
      supabase.rpc("check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
      timeout(RPC_TIMEOUT_MS),
    ]);
    if (error) throw error;

    const ok = data === true;
    if (ok) return { ok: true };

    // Fenstergrenze serverseitig identisch zur SQL-Logik berechnen, um ohne
    // Extra-Roundtrip einen sinnvollen Retry-After zu liefern.
    const nowSeconds = Date.now() / 1000;
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const retryAfter = Math.max(
      1,
      Math.ceil(windowStart + windowSeconds - nowSeconds),
    );
    return { ok: false, retryAfter };
  } catch (err) {
    console.warn(
      "[rate-limit] Durable Store nicht erreichbar, Fallback auf In-Memory:",
      err,
    );
    return rateLimitInMemory(key, limit, windowMs);
  }
}

/**
 * Client-IP aus den Proxy-Headern bestimmen. Auf Vercel ist
 * `x-forwarded-for` gesetzt; der erste Eintrag ist der ursprüngliche Client.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Einheitliche 429-Antwort inkl. `Retry-After`-Header. */
export function tooManyRequests(retryAfter?: number): NextResponse {
  const headers: Record<string, string> = {};
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json(
    {
      error:
        "Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten und erneut versuchen.",
    },
    { status: 429, headers },
  );
}
