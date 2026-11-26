import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db/supabase-server";
import { logWarn } from "@/lib/log";

/**
 * Durable Rate-Limiter (H5) mit In-Memory-Fallback.
 * ----------------------------------------------------------------------------
 * Primärer Pfad: RPC `check_rate_limit` in der Datenbank (supabase/023_rate_limit_
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

/** Zeitstempel (ms) der jüngsten Treffer eines Schlüssels und die Fensterlänge. */
interface Bucket {
  hits: number[];
  windowMs: number;
}

const store = new Map<string, Bucket>();

// Backstop gegen unbegrenztes Wachstum der Map (viele verschiedene IPs):
// gelegentlich tote Buckets aufräumen.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function maybeSweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  // Tot ist ein Bucket, wenn sein jüngster Treffer älter ist als sein eigenes
  // Fenster. Eine feste Stunde wäre falsch: Sie würfe das Tagesfenster der
  // globalen Obergrenze für Anmelde-Mails (M5) zu früh weg.
  for (const [key, bucket] of store) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last === undefined || now - last > bucket.windowMs) {
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
  const hits = (store.get(key)?.hits ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    // gefilterte (gealterte) Liste zurückschreiben, ohne neuen Treffer
    store.set(key, { hits, windowMs });
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  hits.push(now);
  store.set(key, { hits, windowMs });
  return { ok: true };
}

/**
 * Prüft und registriert einen Zugriff auf `key`. Erlaubt höchstens `limit`
 * Treffer innerhalb von `windowMs`. Versucht zuerst den durable Store in der Datenbank
 * (check_rate_limit-RPC, festes Zeitfenster); bei jedem Fehler (Migration
 * noch nicht deployed, Netzwerkproblem) Fallback auf `rateLimitInMemory`.
 */
// Obergrenze für den RPC-Roundtrip: schlägt die Daten-API (nicht nur die RPC,
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
    // Der Schlüssel enthält die Client-IP; sie darf nicht ungekürzt ins Log.
    logWarn(
      "[rate-limit] Durable Store nicht erreichbar, Fallback auf In-Memory:",
      err,
    );
    return rateLimitInMemory(key, limit, windowMs);
  }
}

/** Client-IP aus den Proxy-Headern; Begründung in `lib/client-ip.ts`. */
export { clientIpKey, getClientIp } from "@/lib/client-ip";

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
