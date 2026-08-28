import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { userIsCompanyMember } from "@/lib/auth/ownership";
import {
  canonicalizeForHash,
  hashBodyMetaV2,
  type CertificateMetaFields,
} from "@/lib/hash/canonicalize";
import { resolveSignatories } from "@/lib/certificate/signatories";
import { certificateTypeLabel } from "@/lib/certificate/certificate-title";
import { signCertificateHash } from "@/lib/crypto/signing";

// S2: node:crypto (Ed25519) benötigt die Node-Runtime (nicht Edge).
export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!(await userIsCompanyMember(supabase, cert.company_id, user.id)))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (!cert.generated_text) {
    return NextResponse.json(
      { error: "Zeugnistext muss zuerst generiert werden." },
      { status: 400 },
    );
  }

  if (cert.status === "final") {
    return NextResponse.json(
      { error: "Zeugnis ist bereits finalisiert." },
      { status: 400 },
    );
  }

  if (cert.status === "revoked") {
    return NextResponse.json(
      { error: "Widerrufene Zeugnisse können nicht erneut finalisiert werden." },
      { status: 400 },
    );
  }

  // Hash über den TATSÄCHLICH gedruckten Body bilden – exakt dieselbe Quelle
  // wie das PDF (app/api/certificates/[id]/pdf/route.ts) und dieselbe
  // Pipeline wie die Verifikation (canonicalizeForHash). Datum/Ort sind als
  // letzter Absatz Teil des Body, daher kein separates (flüchtiges) Datum.
  const bodyText = cert.edited_text || cert.generated_text || "";
  const canonicalString = canonicalizeForHash(bodyText);

  // S1b: Meta-Snapshot (Arbeitgeber / Titel / Unterzeichnende) zum
  // Finalisierungszeitpunkt EINFRIEREN. Der v2-Hash deckt Body UND Meta; das
  // PDF bettet exakt diesen Snapshot als unsichtbaren Block ein, damit die
  // Prüfung den v2-Hash rekonstruieren kann – auch wenn Firmenname/
  // Unterzeichnende später geändert werden. So ist ein getauschter Briefkopf
  // oder Unterschriftenblock nicht mehr unbemerkt möglich (Hash bricht bzw. die
  // registrierten Soll-Angaben decken den Tausch auf).
  const company = cert.companies ?? {};
  const sig = resolveSignatories(cert, company);
  const metaSnapshot: CertificateMetaFields = {
    employer: company?.name ?? "",
    documentTitle: certificateTypeLabel(cert.type),
    signatory1Name: sig.signatory_1_name ?? "",
    signatory1Role: sig.signatory_1_role ?? "",
    signatory2Name: sig.signatory_2_name ?? "",
    signatory2Role: sig.signatory_2_role ?? "",
  };
  const hash = await hashBodyMetaV2(bodyText, metaSnapshot);

  // S2: v2-Hash mit dem privaten Plattform-Schlüssel (Ed25519) signieren. Die
  // Signatur wird gespeichert UND (im PDF) eingebettet; die Prüfung verifiziert
  // sie offline gegen den öffentlichen Schlüssel -> „nur zeugnio konnte das
  // ausstellen". Ist KEIN Schlüssel konfiguriert (z. B. Preview ohne Env),
  // bleibt signed null: die Finalisierung läuft ohne Signatur weiter (voller
  // Bestandsschutz), die Prüfung fällt sauber auf den v2-/v1-Hash-Match zurück.
  const signed = signCertificateHash(hash);

  // Kritischer Schreibvorgang: schlägt er fehl, darf NICHT ok:true zurück –
  // sonst meldet die UI "finalisiert", obwohl Hash/Status nicht gespeichert sind.
  const { error: finalizeErr } = await supabase
    .from("certificates")
    .update({
      hash,
      // canonical_content bleibt bewusst der reine Body-Canonical: er dient dem
      // Verifier als Fallback-Lookup (Body erkannt, aber Meta getauscht -> gezielte
      // "Feld-Mismatch"-Meldung statt "unbekannt").
      canonical_content: canonicalString,
      hash_version: 2,
      meta_snapshot: metaSnapshot,
      // S2: null, wenn kein Schlüssel konfiguriert ist (additiv, Bestandsschutz).
      signature: signed?.signature ?? null,
      signing_key_id: signed?.keyId ?? null,
      status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (finalizeErr) {
    return NextResponse.json(
      { error: `Finalisierung konnte nicht gespeichert werden: ${finalizeErr.message}` },
      { status: 500 },
    );
  }

  // V1: Das Employer-Badge ist erst dann ein echtes Trust-Signal, wenn die Firma
  // eine VERIFIZIERTE Domain hat (sonst kann sich ein Self-Issuer das Badge frei
  // selbst ausstellen). Deshalb wird das Badge nur noch bei verifizierter Domain
  // gewährt. Das Finalisieren selbst bleibt davon UNBERÜHRT (kein Hard-Block,
  // voller Bestandsschutz) – es wird lediglich das Badge abgestuft.
  let domainVerified = false;
  if (cert.company_id) {
    const { data: verifiedDom } = await supabase
      .from("company_domains")
      .select("id")
      .eq("company_id", cert.company_id)
      .eq("status", "verified")
      .limit(1)
      .maybeSingle();
    domainVerified = !!verifiedDom;
  }

  // Employer-Badge ist sekundär (kosmetisch): Fehler hier dürfen die bereits
  // erfolgreiche Finalisierung nicht zunichtemachen – nur protokollieren.
  if (cert.company_id && domainVerified) {
    const { error: badgeUpdateErr } = await supabase
      .from("companies")
      .update({ has_employer_badge: true })
      .eq("id", cert.company_id);
    if (badgeUpdateErr) {
      console.warn("[finalize] Employer-Badge-Update fehlgeschlagen:", badgeUpdateErr.message);
    }

    // Idempotent insert in employer_badges
    const { error: badgeUpsertErr } = await supabase
      .from("employer_badges")
      .upsert(
        { company_id: cert.company_id, badge_type: "verified_certificate_employer", active: true },
        { onConflict: "company_id,badge_type", ignoreDuplicates: true },
      );
    if (badgeUpsertErr) {
      console.warn("[finalize] Employer-Badge-Upsert fehlgeschlagen:", badgeUpsertErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    hash,
    // S2: wurde das Zeugnis kryptografisch signiert (Schlüssel konfiguriert)?
    signed: !!signed,
    // Abgestuftes Trust-Level: verifizierter Aussteller vs. nur registriert.
    trustLevel: domainVerified ? "domain_verified" : "registered_only",
  });
}
