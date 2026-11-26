/**
 * zeugnio – Vergleichsfelder für die öffentliche Prüfung
 * ----------------------------------------------------------------------------
 * Zwei Wege führen zu einem registrierten Zeugnis:
 *   - PDF-Abgleich (POST /api/verify): Hash aus dem hochgeladenen Text.
 *   - QR-Scan (POST /api/verify/hash): Hash aus dem QR-Code.
 *
 * Beide zeigen dieselben Soll-Angaben (Mitarbeiter/in, Arbeitgeber, Titel,
 * Datum, Unterzeichnende, Aussteller-Bestätigung). Dieses Modul baut sie an
 * EINER Stelle, damit die zwei Wege nicht auseinanderlaufen.
 *
 * Nur serverseitig verwenden: Es arbeitet mit dem Service-Client.
 */

import type { VerifiedCertificateFields } from "@/lib/hash/canonicalize";
import { resolveCertificatePresentation } from "@/lib/certificate/presentation";
import { isSignoffOnVerifiedDomain } from "@/lib/verify/issuer";
import {
  SIGNOFF_BINDING_COLS,
  certificateTextHash,
  signoffBindingState,
  slotSignatory,
} from "@/lib/certificate/signoff-binding";

/**
 * Spalten für die Prüfung. `meta_snapshot` ist der beim Finalisieren
 * eingefrorene Stand von Arbeitgeber, Titel und Unterzeichnenden, also genau
 * die Werte, über die der v2-Hash gebildet wurde. Die lebenden Spalten bleiben
 * für v1-Zeugnisse geladen, die kein Siegel über diese Felder haben.
 * `signature`/`signing_key_id` braucht nur der QR-Weg; sie gehen nie
 * unverändert in eine Antwort.
 */
export const VERIFY_SELECT_COLS =
  "id, company_id, status, type, hash, hash_version, meta_snapshot, " +
  "finalized_at, revoked_at, signature, signing_key_id, edited_text, generated_text, " +
  "signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role, " +
  "employees(first_name, last_name), " +
  "companies(name, signatory_1_name, signatory_1_role, signatory_2_name, signatory_2_role)";

/**
 * Sucht ein finales oder widerrufenes Zeugnis über seinen Hash. Status bewusst
 * NICHT nur 'final' (H2): Ein widerrufenes Zeugnis muss gefunden werden, damit
 * es als „widerrufen" statt fälschlich als „unbekannt" erscheint.
 *
 * Fällt auf das Prüfregister zurück (036): Hat eine Firma ihre Daten gelöscht,
 * steht das Zeugnis dort ohne Personendaten. Ein Register-Treffer trägt
 * `fromRegister: true`; seine `id` gibt es in `certificates` nicht mehr.
 */
export async function findCertificateByHash(supabase: any, hash: string) {
  const { data } = await supabase
    .from("certificates")
    .select(VERIFY_SELECT_COLS)
    .eq("hash", hash)
    .in("status", ["final", "revoked"])
    .limit(1)
    .maybeSingle();
  if (data) return data;

  const { data: entry } = await supabase
    .from("certificate_register")
    .select(REGISTER_SELECT_COLS)
    .eq("hash", hash)
    .limit(1)
    .maybeSingle();
  return entry ? registerAsMatch(entry) : null;
}

const REGISTER_SELECT_COLS =
  "certificate_id, hash, hash_version, status, finalized_at, revoked_at, " +
  "signature, signing_key_id, employer, document_title, verified_domain, verified_domain_method";

/** Register-Zeile in der Form eines Treffers aus `certificates`. */
function registerAsMatch(entry: any) {
  return {
    fromRegister: true,
    id: entry.certificate_id,
    company_id: null,
    status: entry.status,
    hash: entry.hash,
    hash_version: entry.hash_version,
    finalized_at: entry.finalized_at,
    revoked_at: entry.revoked_at,
    signature: entry.signature,
    signing_key_id: entry.signing_key_id,
    register: entry,
  };
}

/**
 * Sonderfall «Kopf oder Unterschriften verändert» für gelöschte Zeugnisse:
 * Der Text-Hash trifft einen Registereintrag mit v2-Siegel, der Siegel-Hash
 * nicht. Gegenstück zum Abgleich über canonical_content in /api/verify.
 */
export async function findRegisterByBodyHash(supabase: any, bodyHash: string) {
  const { data: entry } = await supabase
    .from("certificate_register")
    .select(REGISTER_SELECT_COLS)
    .eq("body_hash", bodyHash)
    .gte("hash_version", 2)
    .limit(1)
    .maybeSingle();
  return entry ? registerAsMatch(entry) : null;
}

/** ID für verifications.matched_certificate_id (Fremdschlüssel): nie aus dem Register. */
export function matchedCertificateIdForLog(match: any): string | null {
  return match && !match.fromRegister ? match.id : null;
}

/**
 * PostgREST bettet 1:1-Relationen als Objekt ein, je nach Typ-Inferenz auch
 * als Array. Gibt in beiden Fällen das eine Objekt zurück.
 */
export function pickOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function formatDateCh(value: string | null | undefined): string | null {
  return value
    ? new Date(value).toLocaleDateString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;
}

/**
 * Baut die Soll-Angaben eines gefundenen Zeugnisses. `signatureValid` setzt
 * der aufrufende Weg selbst, weil PDF- und QR-Weg die Signatur verschieden
 * prüfen (eingebettet im PDF bzw. gespeichert in der Datenbank).
 */
export async function buildCertificateFields(
  supabase: any,
  match: any,
): Promise<Omit<VerifiedCertificateFields, "signatureValid">> {
  if (match.fromRegister) {
    const entry = match.register;
    return {
      employeeName: "",
      employer: entry.employer ?? "",
      documentType: entry.document_title ?? "Arbeitszeugnis",
      issueDate: formatDateCh(entry.finalized_at),
      signatory1Name: null,
      signatory1Role: null,
      signatory2Name: null,
      signatory2Role: null,
      // 039: Stufe aus dem Register. Einträge von vor 039 tragen 'email'.
      verifiedDomain:
        entry.verified_domain_method === "dns" ? (entry.verified_domain ?? null) : null,
      emailConfirmedDomain:
        entry.verified_domain_method === "dns" ? null : (entry.verified_domain ?? null),
      signatory1ConfirmedAt: null,
      signatory2ConfirmedAt: null,
      sealVersion: entry.hash_version ?? 1,
      fromRegister: true,
    };
  }

  const employee = pickOne<{ first_name?: string; last_name?: string }>(
    match.employees,
  );
  const company = pickOne<Record<string, any>>(match.companies);

  // Soll-Angaben bei v2 aus dem eingefrorenen meta_snapshot, also aus dem, was
  // tatsächlich versiegelt wurde. Sonst würde eine spätere, legitime Änderung
  // der Firmen-Unterzeichnenden eine ältere, echte Kopie wie eine Fälschung
  // aussehen lassen. v1 behält den lebenden Pfad (Bestandsschutz).
  const presentation = resolveCertificatePresentation(match, company ?? {});
  const signatories = presentation.signatories;

  // V1-Trust-Signal: per DNS bestätigte Domain der ausstellenden Firma. Liegt
  // AUSSERHALB des Hashes und belegt den Aussteller. Seit Migration 039 heisst
  // 'verified' immer DNS. Die Vorstufe 'email_confirmed' (eine Mailadresse an
  // der Domain) geht nur als grauer Hinweis hinaus (Sicherheitstest, M2).
  let verifiedDomain: string | null = null;
  let emailConfirmedDomain: string | null = null;
  if (match.company_id) {
    const { data: doms } = await supabase
      .from("company_domains")
      .select("domain, status")
      .eq("company_id", match.company_id)
      .in("status", ["verified", "email_confirmed"])
      .order("verified_at", { ascending: true });
    verifiedDomain = doms?.find((d: any) => d.status === "verified")?.domain ?? null;
    emailConfirmedDomain = verifiedDomain
      ? null
      : (doms?.find((d: any) => d.status === "email_confirmed")?.domain ?? null);
  }

  // V2: per Magic-Link bestätigte Unterzeichner-Freigaben. Nur das Datum pro
  // Slot geht hinaus; die bestätigende E-Mail bleibt aus Datenschutzgründen
  // ausserhalb der öffentlichen Antwort. Sie wird hier nur gelesen, um zu
  // entscheiden, ob die Freigabe an der verifizierten Firmen-Domain lag. Nur
  // dann ist sie ein Beleg (`…ConfirmedAt`); sonst erscheint sie als
  // «Adresse nicht geprüft» (`…ConfirmedUnverifiedAt`). Siehe lib/verify/issuer.ts.
  let signatory1ConfirmedAt: string | null = null;
  let signatory2ConfirmedAt: string | null = null;
  let signatory1ConfirmedUnverifiedAt: string | null = null;
  let signatory2ConfirmedUnverifiedAt: string | null = null;
  //
  // M3 (Sicherheitstest 24.11.2026): Eine Freigabe zählt nur, wenn sie zum
  // versiegelten Text und zu Name und Rolle im Unterschriftsfeld passt. Eine
  // veraltete Freigabe (Text oder Person danach geändert) erscheint gar nicht,
  // auch nicht als grauer Hinweis. Siehe lib/certificate/signoff-binding.ts.
  {
    const textHash = await certificateTextHash(match);
    const { data: signoffs } = await supabase
      .from("certificate_signoffs")
      .select(`email, ${SIGNOFF_BINDING_COLS}`)
      .eq("certificate_id", match.id)
      .eq("status", "confirmed");
    for (const so of signoffs ?? []) {
      const slotNow = slotSignatory(signatories, so.slot);
      const state = signoffBindingState(so, {
        textHash,
        slotName: slotNow.name,
        slotRole: slotNow.role,
        finalizedAt: match.finalized_at,
      });
      if (state !== "bound") continue;
      const formatted = formatDateCh(so.confirmed_at);
      const onDomain = isSignoffOnVerifiedDomain(so.email, verifiedDomain ?? emailConfirmedDomain);
      if (so.slot === 1) {
        if (onDomain) signatory1ConfirmedAt = formatted;
        else signatory1ConfirmedUnverifiedAt = formatted;
      }
      if (so.slot === 2) {
        if (onDomain) signatory2ConfirmedAt = formatted;
        else signatory2ConfirmedUnverifiedAt = formatted;
      }
    }
  }

  // H2 (Sicherheitstest 24.11.2026): den versiegelten Fliesstext mitgeben,
  // damit Prüfende ihn mit dem Papier vergleichen können. Die Prüfung über das
  // PDF vergleicht nur die unsichtbare Textschicht, der QR-Code gar keinen
  // Text. Ohne diese Anzeige gälte ein überklebtes PDF als «unverändert».
  // Quelle wie beim Finalisieren (edited_text, sonst generated_text); beide
  // Felder sind nach dem Finalisieren per Trigger unveränderlich. Nur für
  // gültige Zeugnisse: Bei einem widerrufenen braucht es keinen Vergleich.
  const sealedText =
    match.status === "final"
      ? ((match.edited_text || match.generated_text || "") as string).trim() || null
      : null;

  return {
    employeeName: [employee?.first_name, employee?.last_name]
      .filter(Boolean)
      .join(" "),
    employer: presentation.employer,
    documentType: presentation.documentTitle,
    issueDate: formatDateCh(match.finalized_at),
    signatory1Name: signatories.signatory_1_name,
    signatory1Role: signatories.signatory_1_role,
    signatory2Name: signatories.signatory_2_name,
    signatory2Role: signatories.signatory_2_role,
    verifiedDomain,
    emailConfirmedDomain,
    signatory1ConfirmedAt,
    signatory2ConfirmedAt,
    signatory1ConfirmedUnverifiedAt,
    signatory2ConfirmedUnverifiedAt,
    sealedText,
    // S1b: 2 = Aussteller/Titel/Unterzeichnende sind vom Hash gedeckt.
    sealVersion: match.hash_version ?? 1,
  };
}
