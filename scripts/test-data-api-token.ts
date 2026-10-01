/**
 * Prüft die Token-Brücke zur eigenen Daten-API (lib/db/rest-rewrite.ts).
 *
 * Diese Datei stellt Zugangsdaten für die Datenbank aus. Ein Fehler darin ist entweder ein
 * Datenleck oder ein Totalausfall, und beides würde man im Betrieb erst spät merken –
 * „die App startet" sagt darüber nichts. Darum wird hier nicht das Verhalten im Groben
 * geprüft, sondern jede einzelne Zusage:
 *
 *   1. Umgelenkt wird NUR der Datenpfad. Anmeldung und Storage müssen unberührt bleiben,
 *      sonst bricht die Anmeldung oder die Logos verschwinden.
 *   2. Die Signatur ist echtes HS256 über Kopf und Rumpf – hier unabhängig nachgerechnet,
 *      nicht mit derselben Funktion, die sie erzeugt hat.
 *   3. Die Rolle kommt aus der geprüften Identität, und im Zweifel ist sie `anon`.
 *      Niemals `authenticated` auf Verdacht.
 *   4. Der Supabase-Schlüssel erreicht die Daten-API nicht.
 *   5. Ohne eigenes Geheimnis gibt es einen Fehler, keinen stillen Rückfall auf Supabase.
 *
 * Ausführen: npm run test:dataapi
 */
import { createHmac } from "node:crypto";

const SUPABASE = "https://projekt.supabase.co";
const DATA_API = "http://127.0.0.1:3011";
const SECRET = "test-geheimnis-nur-fuer-diesen-lauf";
const USER_ID = "11111111-1111-1111-1111-111111111111";

// Vor dem ersten Aufruf setzen. Das Modul liest die Umgebung in den Funktionen, nicht beim
// Laden – ein statischer Import ist darum unproblematisch.
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
process.env.DATA_API_URL = DATA_API;
process.env.DATA_API_JWT_SECRET = SECRET;

import { createDataApiFetch, dataApiTarget } from "../lib/db/rest-rewrite";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

/** Letzte an das echte fetch übergebene Anfrage, für die Prüfungen unten. */
interface Captured {
  url: string;
  headers: Headers;
}
let captured: Captured | null = null;

/**
 * Lesezugriff über eine Funktion, nicht direkt auf die Variable. Grund: TypeScript engt
 * `captured` nach einem `captured = null` auf `null` ein und kann nicht wissen, dass die
 * Stub-Implementierung von fetch sie dazwischen wieder füllt — jeder spätere Zugriff wäre
 * dann vom Typ `never`. Der Aufruf gibt den deklarierten Typ zurück und beendet die
 * Einengung.
 */
function last(): Captured | null {
  return captured;
}

/** Zerlegt ein JWT und rechnet die Signatur unabhängig nach. */
function inspect(token: string) {
  const [h, p, s] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")),
    signatureOk: s === expected,
    parts: token.split(".").length,
  };
}

function bearer(): string {
  return (last()?.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
}

async function main() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    captured = { url, headers };
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    console.log("\nToken-Brücke zur Daten-API\n");

    // --- 1. Was umgelenkt wird, und was nicht ------------------------------------------
    console.log("Umlenkung:");
    const svc = createDataApiFetch({ role: "service_role" })!;

    await svc(`${SUPABASE}/rest/v1/certificates?select=id`, { headers: { apikey: "sb_secret_x" } });
    check(
      "Datenpfad geht an die eigene API, ohne das Präfix /rest/v1",
      last()?.url === `${DATA_API}/certificates?select=id`,
      last()?.url,
    );

    captured = null;
    await svc(`${SUPABASE}/auth/v1/user`, { headers: { apikey: "sb_publishable_x" } });
    check("Anmeldung bleibt bei Supabase", last()?.url === `${SUPABASE}/auth/v1/user`, last()?.url);

    captured = null;
    await svc(`${SUPABASE}/storage/v1/object/company-logos/x.png`);
    check(
      "Storage bleibt bei Supabase",
      last()?.url === `${SUPABASE}/storage/v1/object/company-logos/x.png`,
      last()?.url,
    );

    captured = null;
    await svc("https://fremde-domain.example/rest/v1/certificates");
    check(
      "Fremde Adresse mit gleichem Pfad wird NICHT umgelenkt",
      last()?.url === "https://fremde-domain.example/rest/v1/certificates",
      last()?.url,
    );

    captured = null;
    await svc(new Request(`${SUPABASE}/rest/v1/companies`, { method: "POST", body: "{}" }));
    check("Request-Objekt wird ebenfalls umgelenkt", last()?.url === `${DATA_API}/companies`, last()?.url);

    // --- 2. Form und Signatur des Tokens -----------------------------------------------
    console.log("\nToken:");
    captured = null;
    await svc(`${SUPABASE}/rest/v1/certificates`);
    const token = inspect(bearer());

    check("drei Teile (Kopf, Rumpf, Signatur)", token.parts === 3);
    check("alg ist HS256", token.header.alg === "HS256", JSON.stringify(token.header));
    check("Signatur unabhängig nachgerechnet stimmt", token.signatureOk);
    check("aud ist authenticated (jwt-aud in postgrest.conf)", token.payload.aud === "authenticated");
    check("exp liegt in der Zukunft", token.payload.exp > Math.floor(Date.now() / 1000));
    check(
      "Lebensdauer ist kurz (höchstens 5 Minuten)",
      token.payload.exp - token.payload.iat <= 300,
      `${token.payload.exp - token.payload.iat}s`,
    );

    // --- 3. Rollen und Identität -------------------------------------------------------
    console.log("\nRolle und Identität:");
    check("Service-Client erhält role=service_role", token.payload.role === "service_role", token.payload.role);
    check("Service-Client hat kein sub", token.payload.sub === undefined, String(token.payload.sub));

    const angemeldet = createDataApiFetch({
      resolveIdentity: async () => ({ role: "authenticated", sub: USER_ID }),
    })!;
    captured = null;
    await angemeldet(`${SUPABASE}/rest/v1/x`);
    let t = inspect(bearer());
    check("Angemeldet: role=authenticated", t.payload.role === "authenticated", t.payload.role);
    check("Angemeldet: sub ist die Benutzer-ID (auth.uid() liest ihn)", t.payload.sub === USER_ID);

    const abgemeldet = createDataApiFetch({ resolveIdentity: async () => null })!;
    captured = null;
    await abgemeldet(`${SUPABASE}/rest/v1/x`);
    t = inspect(bearer());
    check("Niemand angemeldet: role=anon", t.payload.role === "anon", t.payload.role);

    // Der wichtigste Fall: ist die Identität nicht zu klären, darf NICHT authenticated
    // herauskommen. Im Zweifel sieht die Zeilensicherheit nichts.
    const kaputt = createDataApiFetch({
      resolveIdentity: async () => {
        throw new Error("Auth-Server nicht erreichbar");
      },
    })!;
    captured = null;
    await kaputt(`${SUPABASE}/rest/v1/x`);
    t = inspect(bearer());
    check(
      "Identität nicht auflösbar: role=anon, nicht authenticated",
      t.payload.role === "anon",
      t.payload.role,
    );

    let aufrufe = 0;
    const einmal = createDataApiFetch({
      resolveIdentity: async () => {
        aufrufe++;
        return { role: "authenticated", sub: USER_ID };
      },
    })!;
    await einmal(`${SUPABASE}/rest/v1/a`);
    await einmal(`${SUPABASE}/rest/v1/b`);
    await einmal(`${SUPABASE}/rest/v1/c`);
    check("getUser() wird pro Client nur einmal aufgerufen", aufrufe === 1, `${aufrufe} Aufrufe`);

    // --- 4. Der Supabase-Schlüssel darf nicht mitreisen --------------------------------
    console.log("\nZugangsdaten:");
    captured = null;
    await svc(`${SUPABASE}/rest/v1/x`, {
      headers: { apikey: "sb_secret_geheim", Authorization: "Bearer sb_secret_geheim" },
    });
    check("apikey-Kopfzeile ist entfernt", last()?.headers.get("apikey") === null);
    check(
      "Authorization ist ersetzt, nicht ergänzt",
      !bearer().includes("sb_secret_geheim") && bearer().split(".").length === 3,
      bearer().slice(0, 12),
    );

    // Gegenprobe: bei einer NICHT umgelenkten Anfrage bleiben die Kopfzeilen, wie sie
    // waren – sonst könnte sich die Anmeldung nicht mehr ausweisen.
    captured = null;
    await svc(`${SUPABASE}/auth/v1/user`, { headers: { apikey: "sb_publishable_x" } });
    check(
      "bei Anmelde-Anfragen bleibt apikey erhalten",
      last()?.headers.get("apikey") === "sb_publishable_x",
      String(last()?.headers.get("apikey")),
    );

    // --- 5. Fehlende Konfiguration -----------------------------------------------------
    console.log("\nKonfiguration:");
    check("dataApiTarget nennt die eigene Adresse", dataApiTarget() === DATA_API, dataApiTarget());

    delete process.env.DATA_API_JWT_SECRET;
    let threw = false;
    try {
      createDataApiFetch({ role: "service_role" });
    } catch {
      threw = true;
    }
    check("ohne DATA_API_JWT_SECRET: Fehler, kein stiller Rückfall auf Supabase", threw);
    process.env.DATA_API_JWT_SECRET = SECRET;

    delete process.env.DATA_API_URL;
    check(
      "ohne DATA_API_URL: kein eigenes fetch, alles läuft wie vorher",
      createDataApiFetch({ role: "service_role" }) === undefined,
    );
    process.env.DATA_API_URL = DATA_API;
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
