/**
 * Test des JSON-Lesens mit Obergrenze (lib/http/read-json.ts) und der
 * Grenzen der öffentlichen Prüfung (lib/verify/limits.ts).
 *
 *   npm run test:read-json
 */
import assert from "node:assert/strict";
import { readJsonLimited } from "../lib/http/read-json";
import { MAX_VERIFY_BODY_BYTES, MAX_VERIFY_TEXT_CHARS } from "../lib/verify/limits";

let n = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
}

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    // Für einen Stream als Body verlangt Node diese Angabe.
    duplex: "half",
  } as RequestInit);
}

/** Body als Stream ohne Content-Length, in Stücken (wie «chunked»). */
function streamed(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < parts.length) controller.enqueue(enc.encode(parts[i++]));
      else controller.close();
    },
  });
}

async function main() {
  await check("gültiges JSON wird gelesen", async () => {
    const r = await readJsonLimited(post(JSON.stringify({ text: "Grüezi" })), 1000);
    assert.deepEqual(r, { ok: true, value: { text: "Grüezi" } });
  });

  await check("ungültiges JSON: «ungueltig», ohne die Eingabe zu wiederholen", async () => {
    const r = await readJsonLimited(post("{kein json"), 1000);
    assert.deepEqual(r, { ok: false, reason: "ungueltig" });
  });

  await check("leerer Body: «ungueltig»", async () => {
    const r = await readJsonLimited(new Request("http://localhost/x", { method: "POST" }), 1000);
    assert.deepEqual(r, { ok: false, reason: "ungueltig" });
  });

  await check("zu grosses Content-Length: abgewiesen, bevor gelesen wird", async () => {
    const req = post(streamed(["x".repeat(5000)]), { "content-length": "5000" });
    const r = await readJsonLimited(req, 1000);
    assert.deepEqual(r, { ok: false, reason: "zu_gross" });
    assert.equal(req.bodyUsed, false, "Body darf nicht gelesen werden");
  });

  await check("Stream ohne Content-Length über der Grenze: abgebrochen", async () => {
    const r = await readJsonLimited(post(streamed(['{"text":"', "x".repeat(800), "x".repeat(800), '"}'])), 1000);
    assert.deepEqual(r, { ok: false, reason: "zu_gross" });
  });

  await check("falsches (zu kleines) Content-Length hilft nicht", async () => {
    const r = await readJsonLimited(post(streamed(["[", "1,".repeat(600), "1]"]), { "content-length": "10" }), 1000);
    assert.deepEqual(r, { ok: false, reason: "zu_gross" });
  });

  await check("Stream genau an der Grenze geht durch", async () => {
    const json = JSON.stringify({ text: "y".repeat(990) });
    const r = await readJsonLimited(post(streamed([json.slice(0, 500), json.slice(500)])), json.length);
    assert.equal(r.ok, true);
  });

  await check("Umlaute über Stückgrenzen werden richtig zusammengesetzt", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "Zürich" }));
    const cut = bytes.indexOf(0xc3) + 1; // mitten im «ü»
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const r = await readJsonLimited(post(body), 1000);
    assert.deepEqual(r, { ok: true, value: { text: "Zürich" } });
  });

  await check("Grenzen: maximaler Text mit Umlauten passt in die Byte-Grenze", async () => {
    const text = "ä".repeat(MAX_VERIFY_TEXT_CHARS);
    const bytes = new TextEncoder().encode(JSON.stringify({ text })).byteLength;
    assert.ok(bytes <= MAX_VERIFY_BODY_BYTES, `${bytes} Bytes > ${MAX_VERIFY_BODY_BYTES}`);
  });

  await check("Grenzen: 200 000 Zeichen", async () => {
    assert.equal(MAX_VERIFY_TEXT_CHARS, 200_000);
  });

  console.log(`\n${n} Prüfungen ok`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
