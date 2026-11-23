/**
 * Prüft die Zugangstoken für die eigene Daten-API (lib/db/rest-rewrite.ts) und den
 * Datenclient darauf (@supabase/postgrest-js, wie in lib/db/supabase-server.ts).
 *
 * Diese Datei stellt Zugangsdaten für die Datenbank aus. Ein Fehler darin ist entweder ein
 * Datenleck oder ein Totalausfall, und beides würde man im Betrieb erst spät merken –
 * „die App startet" sagt darüber nichts. Darum wird hier nicht das Verhalten im Groben
 * geprüft, sondern jede einzelne Zusage:
 *
 *   1. Das Token geht NUR an die eigene Daten-API, nie an eine fremde Adresse.
 *   2. Die Signatur ist echtes HS256 über Kopf und Rumpf – hier unabhängig nachgerechnet,
 *      nicht mit derselben Funktion, die sie erzeugt hat.
 *   3. Die Rolle kommt aus der geprüften Identität, und im Zweifel ist sie `anon`.
 *      Niemals `authenticated` auf Verdacht.
 *   4. Ein mitgegebener Schlüssel (apikey, Authorization) erreicht die Daten-API nicht.
 *   5. Der Datenclient baut dieselben Adressen und Kopfzeilen wie vorher supabase-js
 *      hinter der Umleitung (`/tabelle`, `/rpc/funktion`, Accept-/Content-Profile: public).
 *   6. Ohne Adresse oder Geheimnis gibt es einen Fehler, keinen stillen Rückfall.
 *
 * Ausführen: npm run test:dataapi
 */
import { createHmac } from "node:crypto";
import { PostgrestClient } from "@supabase/postgrest-js";

const DATA_API = "http://127.0.0.1:3011";
const SECRET = "test-geheimnis-nur-fuer-diesen-lauf";
const USER_ID = "11111111-1111-1111-1111-111111111111";

// Vor dem ersten Aufruf setzen. Das Modul liest die Umgebung in den Funktionen, nicht beim
// Laden – ein statischer Import ist darum unproblematisch.
process.env.DATA_API_URL = DATA_API;
process.env.DATA_API_JWT_SECRET = SECRET;

import { createDataApiFetch, dataApiBase, dataApiTarget, serviceDataApi } from "../lib/db/rest-rewrite";

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

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
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
    console.log("\nZugangstoken für die Daten-API\n");

    // --- 1. Wohin ein Token geht ------------------------------------------------------
    console.log("Ziel:");
    const svc = createDataApiFetch({ role: "service_role" });

    await svc(`${DATA_API}/certificates?select=id`, { headers: { apikey: "sb_secret_x" } });
    check(
      "Anfrage an die Daten-API geht unverändert an dieselbe Adresse",
      last()?.url === `${DATA_API}/certificates?select=id`,
      last()?.url,
    );
    check("…und trägt ein Token", bearer().split(".").length === 3);

    captured = null;
    await svc("https://fremde-domain.example/certificates", {
      headers: { Authorization: "Bearer bleibt" },
    });
    check(
      "Fremde Adresse bekommt KEIN Token",
      last()?.url === "https://fremde-domain.example/certificates" &&
        last()?.headers.get("Authorization") === "Bearer bleibt",
      String(last()?.headers.get("Authorization")),
    );

    captured = null;
    await svc("http://127.0.0.1:30110/certificates");
    check(
      "Ähnliche Adresse (gleicher Anfang, anderer Port) bekommt kein Token",
      last()?.headers.get("Authorization") === null,
      String(last()?.headers.get("Authorization")),
    );

    captured = null;
    await svc(new Request(`${DATA_API}/companies`, { method: "POST", body: "{}" }));
    check(
      "Request-Objekt: gleiche Adresse, mit Token",
      last()?.url === `${DATA_API}/companies` && bearer().split(".").length === 3,
      last()?.url,
    );

    // --- 2. Form und Signatur des Tokens -----------------------------------------------
    console.log("\nToken:");
    captured = null;
    await svc(`${DATA_API}/certificates`);
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
    });
    captured = null;
    await angemeldet(`${DATA_API}/x`);
    let t = inspect(bearer());
    check("Angemeldet: role=authenticated", t.payload.role === "authenticated", t.payload.role);
    check("Angemeldet: sub ist die Benutzer-ID (auth.uid() liest ihn)", t.payload.sub === USER_ID);

    const abgemeldet = createDataApiFetch({ resolveIdentity: async () => null });
    captured = null;
    await abgemeldet(`${DATA_API}/x`);
    t = inspect(bearer());
    check("Niemand angemeldet: role=anon", t.payload.role === "anon", t.payload.role);

    // Der wichtigste Fall: ist die Identität nicht zu klären, darf NICHT authenticated
    // herauskommen. Im Zweifel sieht die Zeilensicherheit nichts.
    const kaputt = createDataApiFetch({
      resolveIdentity: async () => {
        throw new Error("Sitzung nicht nachschlagbar");
      },
    });
    captured = null;
    await kaputt(`${DATA_API}/x`);
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
    });
    await einmal(`${DATA_API}/a`);
    await einmal(`${DATA_API}/b`);
    await einmal(`${DATA_API}/c`);
    check("Identität wird pro Client nur einmal aufgelöst", aufrufe === 1, `${aufrufe} Aufrufe`);

    const ohneAngabe = createDataApiFetch();
    captured = null;
    await ohneAngabe(`${DATA_API}/x`);
    t = inspect(bearer());
    check("Weder Rolle noch Identität angegeben: role=anon", t.payload.role === "anon", t.payload.role);

    const direkt = inspect(serviceDataApi().authorization.replace(/^Bearer /, ""));
    check(
      "serviceDataApi (Anmeldung, lib/auth/store.ts): role=service_role, gültige Signatur",
      direkt.payload.role === "service_role" && direkt.signatureOk && direkt.payload.sub === undefined,
    );

    // --- 4. Mitgegebene Schlüssel reisen nicht mit -------------------------------------
    console.log("\nZugangsdaten:");
    captured = null;
    await svc(`${DATA_API}/x`, {
      headers: { apikey: "sb_secret_geheim", Authorization: "Bearer sb_secret_geheim" },
    });
    check("apikey-Kopfzeile ist entfernt", last()?.headers.get("apikey") === null);
    check(
      "Authorization ist ersetzt, nicht ergänzt",
      !bearer().includes("sb_secret_geheim") && bearer().split(".").length === 3,
      bearer().slice(0, 12),
    );

    // --- 5. Der Datenclient ------------------------------------------------------------
    console.log("\nDatenclient (postgrest-js):");
    const client = new PostgrestClient(dataApiBase(), {
      schema: "public",
      fetch: createDataApiFetch({
        resolveIdentity: async () => ({ role: "authenticated", sub: USER_ID }),
      }),
    });
    captured = null;
    await client.from("certificates").select("id").eq("status", "final");
    check(
      ".from() geht an /tabelle direkt unter der Wurzel",
      last()?.url === `${DATA_API}/certificates?select=id&status=eq.final`,
      last()?.url,
    );
    check(
      "Accept-Profile: public (wie bisher mit supabase-js)",
      last()?.headers.get("Accept-Profile") === "public",
      String(last()?.headers.get("Accept-Profile")),
    );
    t = inspect(bearer());
    check(
      "Datenclient trägt das Token der Person",
      t.signatureOk && t.payload.role === "authenticated" && t.payload.sub === USER_ID,
    );

    captured = null;
    await client.rpc("zeugnio_company_role", { p_company_id: "x" });
    check(
      ".rpc() geht an /rpc/funktion",
      last()?.url === `${DATA_API}/rpc/zeugnio_company_role`,
      last()?.url,
    );
    check(
      "Content-Profile: public bei .rpc()",
      last()?.headers.get("Content-Profile") === "public",
      String(last()?.headers.get("Content-Profile")),
    );

    // --- 6. Fehlende Konfiguration -----------------------------------------------------
    console.log("\nKonfiguration:");
    check("dataApiTarget nennt die eigene Adresse", dataApiTarget() === DATA_API, dataApiTarget());

    delete process.env.DATA_API_JWT_SECRET;
    check(
      "ohne DATA_API_JWT_SECRET: Fehler, kein Rückfall",
      throws(() => createDataApiFetch({ role: "service_role" })) && throws(() => serviceDataApi()),
    );
    process.env.DATA_API_JWT_SECRET = SECRET;

    delete process.env.DATA_API_URL;
    check(
      "ohne DATA_API_URL: Fehler, kein Rückfall",
      throws(() => createDataApiFetch({ role: "service_role" })) &&
        throws(() => serviceDataApi()) &&
        throws(() => dataApiBase()),
    );
    check(
      "ohne DATA_API_URL: dataApiTarget meldet das, ohne zu werfen",
      dataApiTarget() === "(keine Adresse konfiguriert)",
      dataApiTarget(),
    );

    process.env.DATA_API_URL = `${DATA_API}/`;
    check("Schrägstrich am Ende wird abgeschnitten", dataApiBase() === DATA_API, dataApiBase());
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
