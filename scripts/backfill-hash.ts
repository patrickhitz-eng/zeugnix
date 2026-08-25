/**
 * Einmaliges Backfill: berechnet den Hash bereits finalisierter Zeugnisse mit
 * der neuen Pipeline neu (canonicalizeForHash über edited_text || generated_text)
 * und schreibt hash + canonical_content zurück.
 *
 * Hintergrund: Vor dem Verifikations-Fix wurde der Hash anders gebildet als
 * beim Prüfen – die Werte in der DB waren damit nie verifizierbar. Nach dem
 * Backfill erzeugt der nächste PDF-Download automatisch ein gültiges
 * Sentinel-PDF mit passendem Hash.
 *
 * Ausführen:
 *   npm run backfill:hash
 *
 * Benötigt .env.local mit NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { canonicalizeForHash, sha256 } from "../lib/hash/canonicalize";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Fehlt: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY (.env.local).",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: certs, error } = await supabase
    .from("certificates")
    .select("id, edited_text, generated_text, hash, hash_version")
    .eq("status", "final");

  if (error) {
    console.error("Laden fehlgeschlagen:", error.message);
    process.exit(1);
  }
  if (!certs || certs.length === 0) {
    console.log("Keine finalisierten Zeugnisse gefunden – nichts zu tun.");
    return;
  }

  console.log(`${certs.length} finalisierte Zeugnisse gefunden. Re-Hashing…\n`);
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let skippedV2 = 0;

  for (const cert of certs) {
    // S1b: v2-Zeugnisse NIEMALS anfassen. Ihr Hash deckt Body + Meta; ein
    // reines Body-Re-Hashing (unten) würde das Siegel zerstören. canonical_content
    // ist bei v2 bewusst nur der Body – kein Grund zum Zurückschreiben.
    if ((cert.hash_version ?? 1) >= 2) {
      skippedV2++;
      continue;
    }

    const bodyText = cert.edited_text || cert.generated_text || "";
    if (!bodyText) {
      console.warn(`  ⚠ ${cert.id}: kein Body-Text, übersprungen`);
      failed++;
      continue;
    }

    const canonical = canonicalizeForHash(bodyText);
    const hash = await sha256(canonical);

    if (hash === cert.hash) {
      unchanged++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("certificates")
      .update({ hash, canonical_content: canonical })
      .eq("id", cert.id);

    if (upErr) {
      console.error(`  ✗ ${cert.id}: ${upErr.message}`);
      failed++;
      continue;
    }

    console.log(
      `  ✓ ${cert.id}: ${cert.hash ? cert.hash.slice(0, 12) : "—"} → ${hash.slice(0, 12)}`,
    );
    updated++;
  }

  console.log(
    `\nFertig: ${updated} aktualisiert, ${unchanged} bereits korrekt, ${skippedV2} v2 übersprungen, ${failed} fehlgeschlagen.`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
