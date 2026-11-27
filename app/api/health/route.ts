import { existsSync } from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/db/supabase-server";
import { dataApiTarget } from "@/lib/db/rest-rewrite";
import { hasBearerSecret } from "@/lib/secret-compare";

/**
 * Lebenszeichen für das Deploy-Skript auf nine.ch und für die Überwachung.
 *
 * Antwortet nur mit "ok", wenn die App läuft, die Daten erreichbar sind, das Schema
 * vorhanden ist, die Schriftdateien am erwarteten Ort liegen und die Umgebung vollständig
 * ist.
 *
 * Öffentlich steht in der Antwort nur `{ "ok": true }` oder `{ "ok": false }`, dazu der
 * HTTP-Status 200 oder 503. Mehr braucht keiner der Aufrufer: deploy.sh (curl -f), der
 * Watchdog und die Überwachung werten nur den Status aus. Die einzelnen Befunde (Daten,
 * Schriften, Umgebung, Signatur, Datenquelle) beschreiben den inneren Zustand des Servers,
 * etwa welche Variable fehlt oder ob ein Signaturschlüssel gesetzt ist. Das geht Fremde
 * nichts an, darum gibt es sie nur mit dem Kopf `Authorization: Bearer $CRON_SECRET`
 * (zeitkonstant verglichen, lib/secret-compare.ts). Auch dann nennt die Antwort nur
 * Befunde, nie Werte.
 *
 * Warum die Schriften mitgeprüft werden: lib/pdf/certificate.tsx löst sie über
 * process.cwd() auf. Zeigt das Arbeitsverzeichnis von PM2 auf einen alten Release-Ordner,
 * fehlen die Dateien — und @react-pdf fällt dann ohne Fehlermeldung auf Helvetica zurück.
 * Das Zeugnis sieht falsch aus, der Prozess meldet nichts. Genau solche stillen Fehler
 * sind bei diesem Umzug die gefährlichen, darum stehen sie im Gesundheitstest.
 */
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Die Route ist öffentlich erreichbar. Damit sie nicht als billiger Weg taugt, die
 *  Datenbank zu beschäftigen, wird das Ergebnis kurz vorgehalten. */
const CACHE_MS = 5000;
let cached: { at: number; body: Record<string, string>; ok: boolean } | null = null;

async function checkData(): Promise<string> {
  try {
    const db = createServiceClient();
    // Eine Zeile aus einer Tabelle, die es seit der ersten Migration gibt: prüft in einem
    // Schritt Erreichbarkeit UND Schema. Kein count(*) — das wäre auf einer wachsenden
    // Tabelle ein teurer Gesundheitstest.
    const { error } = await db.from("certificates").select("id").limit(1);
    if (error) {
      console.error("[health] Datenzugriff fehlgeschlagen:", error.message);
      // PostgREST meldet ein fehlendes Schema als 404 mit diesem Code.
      if (error.code === "42P01" || error.code === "PGRST205") return "Schema fehlt";
      if (error.code === "42501") return "Rechte fehlen";
      return "nicht erreichbar";
    }
    return "ok";
  } catch (error) {
    console.error("[health] Datenzugriff nicht möglich:", error);
    return "nicht erreichbar";
  }
}

function checkFonts(): string {
  const dir = path.join(process.cwd(), "public", "fonts");
  const missing = ["Inter-Regular.ttf", "Inter-Bold.ttf"].filter(
    (name) => !existsSync(path.join(dir, name)),
  );
  return missing.length === 0 ? "ok" : `fehlen (${missing.length} von 2)`;
}

function checkEnv(): string {
  // Seit B2 (keine Supabase-Variablen mehr): Daten-API, Anmeldung und Mail. Ohne
  // RESEND_API_KEY kommt keine Anmelde-Mail an, und niemand kann sich anmelden.
  const required = [
    "DATA_API_URL",
    "DATA_API_JWT_SECRET",
    "ZEUGNIO_AUTH_SECRET",
    "RESEND_API_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "CRON_SECRET",
  ];
  // Leer angelegte Variablen sind die gemeinste Falle: sie sehen gesetzt aus, und eine
  // Prüfung mit `in process.env` würde sie durchlassen.
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) return `unvollständig (${missing.join(", ")})`;
  return "ok";
}

function checkSigning(): string {
  // Fehlt der Schlüssel, läuft alles weiter — nur ohne Signatur (voller Bestandsschutz,
  // siehe lib/crypto/signing.ts). Das ist kein Fehler, aber im Betrieb ein Befund.
  return process.env.ZEUGNIO_SIGNING_PRIVATE_KEY?.trim() ? "ok" : "kein Schlüssel gesetzt";
}

/** "eigene" (PostgREST auf derselben Maschine), "andere Adresse" oder "fehlt". */
function datenquelle(): string {
  const target = dataApiTarget();
  if (!target.startsWith("http")) return "fehlt";
  const host = new URL(target).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" ? "eigene" : "andere Adresse";
}

/** Öffentlich nur ok/nicht ok; die Befunde nur für den, der CRON_SECRET kennt. */
function respond(req: NextRequest, body: Record<string, string>, ok: boolean): NextResponse {
  const details = hasBearerSecret(req.headers.get("authorization"), process.env.CRON_SECRET);
  return NextResponse.json(details ? { ok, ...body } : { ok }, {
    status: ok ? 200 : 503,
    headers: noStore,
  });
}

export async function GET(req: NextRequest) {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return respond(req, cached.body, cached.ok);
  }

  const daten = await checkData();
  const schriften = checkFonts();
  const umgebung = checkEnv();
  const signatur = checkSigning();

  // Die Signatur ist absichtlich kein Abbruchgrund: ohne sie funktioniert die Anwendung,
  // sie zeigt nur kein Siegel. Ein fehlgeschlagenes Deployment wegen einer fehlenden
  // Signatur wäre unverhältnismässig.
  const ok = daten === "ok" && schriften === "ok" && umgebung === "ok";

  const body = {
    status: ok ? "ok" : "error",
    daten,
    schriften,
    umgebung,
    signatur,
    // Nur die Herkunft, nicht die Adresse. Seit B2 gibt es keinen zweiten Datenweg mehr;
    // "eigene" heisst: PostgREST über 127.0.0.1, wie auf advisori01 vorgesehen.
    datenquelle: datenquelle(),
  };

  cached = { at: Date.now(), body, ok };
  return respond(req, body, ok);
}
