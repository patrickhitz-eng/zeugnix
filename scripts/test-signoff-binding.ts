/**
 * Tests für die Bindung einer Unterzeichner-Freigabe an Text und Namen
 * (Sicherheitstest 24.11.2026, M3; lib/certificate/signoff-binding.ts).
 *
 * Ausführen:
 *   npm run test:signoff-binding   (bzw. npx tsx scripts/test-signoff-binding.ts)
 *
 * Ohne Test-Framework. Kerngedanke: Eine Freigabe zählt nur für genau den
 * Text und genau die Person, die die unterzeichnende Person gesehen hat.
 * Ändert HR danach Text, Name oder Rolle, ist sie veraltet.
 */
import {
  certificateTextHash,
  sameSignatoryText,
  signoffBindingState,
  slotSignatory,
  type SignoffBindingRow,
} from "../lib/certificate/signoff-binding";
import { canonicalizeForHash, hashBodyV1, sha256 } from "../lib/hash/canonicalize";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

const TEXT_A =
  "Frau Muster war vom 1. Januar 2020 bis 31. Dezember 2025 bei uns tätig.\n\n" +
  "Sie erledigte ihre Aufgaben stets zu unserer vollsten Zufriedenheit.";
const TEXT_B =
  "Frau Muster war vom 1. Januar 2020 bis 31. Dezember 2025 bei uns tätig.\n\n" +
  "Sie erledigte ihre Aufgaben zu unserer Zufriedenheit.";

async function main() {
  console.log("Text-Hash");
  const hashA = await certificateTextHash({ edited_text: null, generated_text: TEXT_A });
  const hashB = await certificateTextHash({ edited_text: TEXT_B, generated_text: TEXT_A });
  check("Hash ist SHA-256-Hex", !!hashA && /^[0-9a-f]{64}$/.test(hashA));
  check("Hash = v1-Body-Hash beim Finalisieren", hashA === (await hashBodyV1(TEXT_A)));
  check(
    "Hash = SHA-256 über canonical_content (wie in der DB gespeichert)",
    hashA === (await sha256(canonicalizeForHash(TEXT_A))),
  );
  check("edited_text geht vor generated_text", hashB === (await hashBodyV1(TEXT_B)));
  check("Anderer Text, anderer Hash", hashA !== hashB);
  check(
    "Zeilenumbrüche und Leerraum ändern den Hash nicht",
    hashA ===
      (await certificateTextHash({ generated_text: TEXT_A.replace(/\n\n/g, "\n   \n") })),
  );
  check("Leerer Text hat keinen Hash", (await certificateTextHash({ generated_text: "  \n " })) === null);
  check("Kein Text hat keinen Hash", (await certificateTextHash({})) === null);

  console.log("Namensvergleich");
  check("Gleicher Name", sameSignatoryText("Anna Beispiel", "Anna Beispiel"));
  check("Leerraum egal", sameSignatoryText(" Anna  Beispiel ", "Anna Beispiel"));
  check("null == leer", sameSignatoryText(null, ""));
  check("Anderer Name", !sameSignatoryText("Anna Beispiel", "Bea Beispiel"));
  check("Rolle gesetzt vs. leer", !sameSignatoryText("Leiterin HR", null));

  const sigs = {
    signatory_1_name: "Anna Beispiel",
    signatory_1_role: "Leiterin HR",
    signatory_2_name: "Carl Muster",
    signatory_2_role: null,
  };
  check("Slot 1", slotSignatory(sigs, 1).name === "Anna Beispiel");
  check("Slot 2 ohne Rolle", slotSignatory(sigs, 2).role === null);
  check("Unbekannter Slot", slotSignatory(sigs, 3).name === null);

  console.log("Zustand einer Freigabe");
  const bound: SignoffBindingRow = {
    slot: 1,
    status: "confirmed",
    name: "Anna Beispiel",
    role: "Leiterin HR",
    confirmed_at: "2026-11-20T10:00:00Z",
    confirmed_text_hash: hashA,
    confirmed_name: "Anna Beispiel",
    confirmed_role: "Leiterin HR",
  };
  const ctxA = { textHash: hashA, slotName: "Anna Beispiel", slotRole: "Leiterin HR" };

  check("Gleicher Text, gleiche Person: zählt", signoffBindingState(bound, ctxA) === "bound");
  check(
    "M3: Text A freigegeben, Text B versiegelt: veraltet",
    signoffBindingState(bound, { ...ctxA, textHash: hashB }) === "stale_text",
  );
  check(
    "Text danach gelöscht: veraltet",
    signoffBindingState(bound, { ...ctxA, textHash: null }) === "stale_text",
  );
  check(
    "Anderer Name im Feld: veraltet",
    signoffBindingState(bound, { ...ctxA, slotName: "Bea Beispiel" }) === "stale_name",
  );
  check(
    "Andere Rolle im Feld: veraltet",
    signoffBindingState(bound, { ...ctxA, slotRole: "Geschäftsführerin" }) === "stale_name",
  );
  check(
    "Unterschriftsfeld geleert: veraltet",
    signoffBindingState(bound, { ...ctxA, slotName: null }) === "stale_name",
  );
  check(
    "Massgeblich ist confirmed_name, nicht name",
    signoffBindingState({ ...bound, name: "Jemand Anderes" }, ctxA) === "bound",
  );
  for (const status of ["pending", "viewed", "declined", "expired"]) {
    check(`Status ${status}: offen`, signoffBindingState({ ...bound, status }, ctxA) === "open");
  }

  console.log("Altbestand ohne Hash (vor 041)");
  const legacy: SignoffBindingRow = {
    slot: 1,
    status: "confirmed",
    name: "Anna Beispiel",
    role: "Leiterin HR",
    confirmed_at: "2026-11-20T10:00:00Z",
    confirmed_text_hash: null,
    confirmed_name: null,
    confirmed_role: null,
  };
  check(
    "Vor dem Finalisieren erteilt: nicht zuordenbar",
    signoffBindingState(legacy, { ...ctxA, finalizedAt: "2026-11-21T09:00:00Z" }) === "unbound",
  );
  check(
    "Noch nicht finalisiert: nicht zuordenbar",
    signoffBindingState(legacy, { ...ctxA, finalizedAt: null }) === "unbound",
  );
  check(
    "Nach dem Finalisieren erteilt: zählt (Text war versiegelt)",
    signoffBindingState(legacy, { ...ctxA, finalizedAt: "2026-11-19T09:00:00Z" }) === "bound",
  );
  check(
    "Nach dem Finalisieren, aber andere Person im Siegel: veraltet",
    signoffBindingState(legacy, {
      ...ctxA,
      slotName: "Bea Beispiel",
      finalizedAt: "2026-11-19T09:00:00Z",
    }) === "stale_name",
  );

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
