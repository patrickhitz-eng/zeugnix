/**
 * zeugnix.ch – Dargestellte Zeugnis-Felder: Siegel vor lebenden Spalten
 * ----------------------------------------------------------------------------
 * Der v2-Hash (S1b, Migration 024) deckt den Fliesstext UND vier materielle
 * Felder ausserhalb des Body: Arbeitgeber, Dokumenttitel und die beiden
 * Unterzeichnenden mit ihren Rollen. Diese vier werden beim Finalisieren in
 * `certificates.meta_snapshot` EINGEFROREN, und der Snapshot ist seit 024
 * DB-seitig unveränderlich.
 *
 * Gerendert wurden sie trotzdem aus lebenden Quellen:
 *   Arbeitgeber      companies.name
 *   Dokumenttitel    certificates.type  -> certificateTypeLabel()
 *   Unterzeichnende  certificates.signatory_* ⟶ companies.signatory_*
 *
 * Damit konnten ausgestelltes Dokument und Siegel auseinanderlaufen, ohne dass
 * der Hash bricht: das PDF bettet den eingefrorenen Meta-Block ein, zeigt aber
 * die lebenden Werte. Zwei davon liegen auf `companies` – eine Sperre ist dort
 * weder möglich (ein Trigger auf `certificates` sieht die Tabelle nicht) noch
 * richtig: eine Firma darf umbenennen und Unterschriftsberechtigungen wechseln.
 *
 * Deshalb liegt die Lösung auf der Darstellungsseite: wer versiegelt ist, wird
 * AUS DEM SIEGEL gerendert. Damit gilt „sichtbar == versiegelt" per Konstruktion
 * – für jeden Schreibweg, heute und künftig.
 *
 * Nebeneffekt, der die korrekte Semantik ist: ein ausgestelltes Zeugnis trägt
 * weiterhin den Firmennamen und die Unterzeichnenden, unter denen es
 * ausgestellt wurde. Ein Arbeitszeugnis von 2023 zeigt den Stand von 2023.
 *
 * BESTANDSSCHUTZ: v1-Zeugnisse (hash_version < 2, kein Snapshot) haben kein
 * Siegel über diese Felder und behalten den lebenden Pfad unverändert.
 *
 * NICHT gedeckt, weil nicht im Hash: Adresse, Logo, Fusszeile (027) und
 * signature_mode. Sie tragen keine Echtheitsaussage und rendern weiter live.
 * Wer sie mit ins Siegel nehmen will, braucht eine neue Hash-Version.
 *
 * EINZIGE Quelle dieser Auflösung – genutzt von PDF (app/api/certificates/[id]/pdf),
 * Word-Export (…/docx), A4-Vorschau (Detailseite) und der Prüfung
 * (app/api/verify). Vier Ausgaben, ein Ergebnis.
 */

import {
  toMetaFields,
  type CertificateMetaFields,
} from "@/lib/hash/canonicalize";
import { certificateTypeLabel } from "./certificate-title";
import {
  resolveSignatories,
  type EffectiveSignatories,
  type SignatoryFields,
} from "./signatories";

export interface PresentationCertificate extends SignatoryFields {
  type?: string | null;
  hash_version?: number | null;
  meta_snapshot?: Partial<CertificateMetaFields> | null;
}

export interface PresentationCompany extends SignatoryFields {
  name?: string | null;
}

export interface CertificatePresentation {
  /** Arbeitgeber für den Briefkopf. */
  employer: string;
  /** Dokumenttitel („Arbeitszeugnis", „Zwischenzeugnis", …). */
  documentTitle: string;
  /** Unterzeichnende in derselben Form wie resolveSignatories(). */
  signatories: EffectiveSignatories;
  /**
   * true = die Werte stammen aus dem eingefrorenen Siegel (v2-Zeugnis),
   * false = aus den lebenden Spalten (v1-Zeugnis oder noch nicht finalisiert).
   */
  fromSeal: boolean;
}

/** Leerstring -> null, damit Renderer und Vorschau den Slot auslassen. */
function orNull(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Die vier Felder aus den LEBENDEN Spalten – der Stand von heute, unabhängig
 * davon, was versiegelt wurde.
 *
 * Das ist der Pfad für noch nicht finalisierte und für v1-Zeugnisse. Darüber
 * hinaus braucht es ihn, um bei einem versiegelten Zeugnis zu erkennen, ob der
 * heutige Stand vom Siegel abweicht (z. B. nach einem Wechsel der
 * Firmen-Unterzeichnenden) – das Dokument zeigt dann weiterhin das Siegel.
 */
export function resolveLiveFields(
  cert: PresentationCertificate,
  company: PresentationCompany,
): Omit<CertificatePresentation, "fromSeal"> {
  return {
    employer: company.name ?? "",
    documentTitle: certificateTypeLabel(cert.type),
    signatories: resolveSignatories(cert, company),
  };
}

/**
 * Liefert die vier hash-gedeckten Felder für die Darstellung.
 *
 * Ist das Zeugnis per v2 versiegelt (hash_version >= 2 UND meta_snapshot
 * vorhanden), kommen alle vier aus dem Snapshot – bewusst wörtlich und ohne
 * Rückfall auf die lebenden Spalten, denn der Hash wurde über genau diese Werte
 * gebildet. Ein Rückfall würde die Entsprechung wieder aufbrechen, die hier der
 * ganze Zweck ist. (Leer können sie bei einem darstellbaren Zeugnis nicht sein:
 * `certificateTypeLabel` liefert immer mindestens „Arbeitszeugnis", und der
 * Arbeitgeber stammt aus derselben Firmen-Verknüpfung, ohne die PDF- und
 * Word-Route mit 400 abbrechen.)
 *
 * Sonst der bisherige lebende Pfad.
 */
export function resolveCertificatePresentation(
  cert: PresentationCertificate,
  company: PresentationCompany,
): CertificatePresentation {
  const sealed =
    (cert.hash_version ?? 1) >= 2 && cert.meta_snapshot
      ? toMetaFields(cert.meta_snapshot)
      : null;

  if (sealed) {
    return {
      employer: sealed.employer,
      documentTitle: sealed.documentTitle,
      signatories: {
        signatory_1_name: orNull(sealed.signatory1Name),
        signatory_1_role: orNull(sealed.signatory1Role),
        signatory_2_name: orNull(sealed.signatory2Name),
        signatory_2_role: orNull(sealed.signatory2Role),
      },
      fromSeal: true,
    };
  }

  return { ...resolveLiveFields(cert, company), fromSeal: false };
}

/**
 * true, wenn das Zeugnis versiegelt ist UND der heutige Stand der lebenden
 * Spalten von diesem Siegel abweicht. Dann zeigen Dokument und Vorschau
 * bewusst das Siegel; die Oberfläche kann das erklären.
 */
export function sealDiffersFromLive(
  cert: PresentationCertificate,
  company: PresentationCompany,
): boolean {
  const sealed = resolveCertificatePresentation(cert, company);
  if (!sealed.fromSeal) return false;
  const live = resolveLiveFields(cert, company);
  return (
    sealed.employer !== live.employer ||
    sealed.documentTitle !== live.documentTitle ||
    sealed.signatories.signatory_1_name !== live.signatories.signatory_1_name ||
    sealed.signatories.signatory_1_role !== live.signatories.signatory_1_role ||
    sealed.signatories.signatory_2_name !== live.signatories.signatory_2_name ||
    sealed.signatories.signatory_2_role !== live.signatories.signatory_2_role
  );
}
