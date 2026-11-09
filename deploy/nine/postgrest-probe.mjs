#!/usr/bin/env node
// Prueft die laufende Daten-API (PostgREST) so, wie die Anwendung sie benutzt.
//
// "Der Dienst laeuft" beweist wenig. Der gefaehrlichste Fehler ist eine Zeilensicherheit, die
// nicht greift, oder ein auth.uid(), das NULL liefert. Beides zeigt sich nicht als Fehler,
// sondern als falsche Ergebnisse. Darum stellt dieses Skript Token aus wie
// lib/db/rest-rewrite.ts (HS256, aud = authenticated, Rolle im Anspruch role) und prueft die
// Antworten:
//   - ohne Token (anon) keine Satzbausteine, als authenticated und service_role alle
//   - debug_whoami bekommt die Benutzer-ID aus dem Token (auth.uid() ist nicht NULL)
//   - fremde Profile bleiben unsichtbar, anon darf nicht schreiben
//   - falsches Geheimnis oder falscher Zweck (aud) werden abgewiesen
//
// Gibt nie ein Token oder Geheimnis aus. Aendert nichts in der Datenbank: Der eine
// Schreibversuch als anon muss scheitern.
//
// Aufruf als www-zeugnio im Checkout:  node deploy/nine/postgrest-probe.mjs
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const shared = process.env.ZEUGNIO_SHARED_DIR ?? path.join(homedir(), "zeugnio", "shared");
const env = readFileSync(path.join(shared, ".env"), "utf8");
const read = (key) => env.match(new RegExp(`^${key}=(["']?)(.*?)\\1[ \\t]*$`, "m"))?.[2] ?? "";

const secret = read("DATA_API_JWT_SECRET");
if (secret === "") {
  console.error("Fehler: DATA_API_JWT_SECRET fehlt in der .env. Zuerst deploy/nine/postgrest-conf.mjs.");
  process.exit(1);
}
const api = (read("DATA_API_URL") || "http://127.0.0.1:3011").replace(/\/$/, "");
const admin = process.env.POSTGREST_ADMIN_URL ?? "http://127.0.0.1:3012";

const b64 = (s) => Buffer.from(s).toString("base64url");
function token({ role, sub, aud = "authenticated", key = secret }) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ aud, role, ...(sub ? { sub } : {}), iat: now, exp: now + 120 }));
  const sig = createHmac("sha256", key).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function call(url, { auth, method = "GET", body, count = false } = {}) {
  const headers = { Accept: "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (count) headers.Prefer = "count=exact";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    const total = Number((res.headers.get("content-range") ?? "").split("/")[1]);
    return { status: res.status, json, total: Number.isFinite(total) ? total : undefined };
  } catch (e) {
    return { status: 0, error: e.cause?.code ?? e.message };
  }
}

const uid = randomUUID();
const asAnon = undefined;
const asAuth = token({ role: "authenticated", sub: uid });
const asService = token({ role: "service_role" });

const checks = [
  ["Admin-Port /live antwortet", async () => { const r = await call(`${admin}/live`); return [r.status === 200, `HTTP ${r.status}${r.error ? " " + r.error : ""}`]; }],
  ["Admin-Port /ready antwortet", async () => { const r = await call(`${admin}/ready`); return [r.status === 200, `HTTP ${r.status}${r.error ? " " + r.error : ""}`]; }],
  ["anon sieht keine Satzbausteine (Zeilensicherheit)", async () => {
    const r = await call(`${api}/phrase_blocks?select=id&limit=1`, { auth: asAnon, count: true });
    return [r.status === 200 && r.total === 0, `HTTP ${r.status}, ${r.total ?? "?"} Zeilen`];
  }],
  // Mit limit=1 und count=exact antwortet PostgREST mit 206 (Partial Content), sobald es mehr
  // als eine Zeile gibt: "1 von 1329". Das ist die richtige Antwort, kein Fehler.
  ["authenticated sieht die Satzbausteine", async () => {
    const r = await call(`${api}/phrase_blocks?select=id&limit=1`, { auth: asAuth, count: true });
    return [[200, 206].includes(r.status) && r.total > 0, `HTTP ${r.status}, ${r.total ?? "?"} Zeilen`];
  }],
  ["service_role sieht die Satzbausteine", async () => {
    const r = await call(`${api}/phrase_blocks?select=id&limit=1`, { auth: asService, count: true });
    return [[200, 206].includes(r.status) && r.total > 0, `HTTP ${r.status}, ${r.total ?? "?"} Zeilen`];
  }],
  ["auth.uid() bekommt die ID aus dem Token", async () => {
    const r = await call(`${api}/rpc/debug_whoami`, { auth: asAuth, method: "POST", body: {} });
    const w = r.json ?? {};
    const ok = r.status === 200 && w.auth_uid === uid && w.current_user === "authenticated" && w.claims_present === true;
    return [ok, `HTTP ${r.status}, current_user ${w.current_user ?? "?"}, auth_uid ${w.auth_uid === uid ? "= Token-ID" : (w.auth_uid ?? "NULL")}`];
  }],
  ["service_role laeuft als service_role", async () => {
    const r = await call(`${api}/rpc/debug_whoami`, { auth: asService, method: "POST", body: {} });
    return [r.status === 200 && r.json?.current_user === "service_role", `HTTP ${r.status}, current_user ${r.json?.current_user ?? "?"}`];
  }],
  ["authenticated sieht keine fremden Profile", async () => {
    const r = await call(`${api}/profiles?select=id`, { auth: asAuth });
    return [r.status === 200 && Array.isArray(r.json) && r.json.length === 0, `HTTP ${r.status}, ${Array.isArray(r.json) ? r.json.length : "?"} Zeilen`];
  }],
  ["anon darf nicht schreiben", async () => {
    const r = await call(`${api}/profiles`, { auth: asAnon, method: "POST", body: { id: uid } });
    return [r.status === 401 || r.status === 403, `HTTP ${r.status} (erwartet 401 oder 403)`];
  }],
  ["schema_migrations ist nicht erreichbar", async () => {
    const r = await call(`${api}/schema_migrations?select=filename&limit=1`, { auth: asService });
    return [[401, 403, 404].includes(r.status), `HTTP ${r.status} (erwartet 401, 403 oder 404)`];
  }],
  ["Token mit falschem Geheimnis wird abgewiesen", async () => {
    const r = await call(`${api}/phrase_blocks?select=id&limit=1`, { auth: token({ role: "service_role", key: "falsch-falsch-falsch-falsch-falsch-falsch" }) });
    return [r.status === 401, `HTTP ${r.status} (erwartet 401)`];
  }],
  ["Token mit falschem Zweck (aud) wird abgewiesen", async () => {
    const r = await call(`${api}/phrase_blocks?select=id&limit=1`, { auth: token({ role: "service_role", aud: "anderswo" }) });
    return [r.status === 401, `HTTP ${r.status} (erwartet 401)`];
  }],
];

console.log(`Daten-API ${api}, Admin ${admin}\n`);
let fehler = 0;
for (const [name, run] of checks) {
  const [ok, detail] = await run();
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"}  ${name.padEnd(50)} ${detail}`);
}
console.log(fehler === 0 ? "\nAlles gruen." : `\n${fehler} Pruefung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
