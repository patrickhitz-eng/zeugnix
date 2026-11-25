/**
 * zeugnio – Bausteine, die PDF-Abgleich und QR-Prüfung gemeinsam anzeigen
 * ----------------------------------------------------------------------------
 * Sicherheitstest 24.11.2026:
 *  - H2: Die Prüfung vergleicht nur die unsichtbare Textschicht des PDFs, der
 *    QR-Code gar keinen Text. Ein überklebtes PDF galt so als «unverändert».
 *    Darum zeigen beide Wege den versiegelten Text zum Vergleich mit dem Papier.
 *  - H3: Eine Freigabe per E-Mail belegt die unterzeichnende Person nur, wenn
 *    die Adresse an der verifizierten Firmen-Domain liegt (lib/verify/issuer.ts).
 */

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Versiegelter Fliesstext mit der Aufforderung, ihn mit dem Dokument zu vergleichen. */
export function SealedTextBlock({
  text,
  source,
}: {
  text: string | null | undefined;
  source: "pdf" | "qr";
}) {
  if (!text) return null;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="rounded-md border border-petrol-300 bg-white p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-petrol-700">
        Versiegelter Text · mit dem Dokument vergleichen
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700">
        {source === "pdf" ? (
          <>
            Geprüft wurde der Text, der in der PDF-Datei gespeichert ist. Was
            auf der Seite sichtbar ist, kann davon abweichen, etwa wenn ein Satz
            überklebt wurde. <strong className="text-ink-900">Gültig ist nur
            dieser Text.</strong> Weicht das Dokument vor Ihnen ab, wurde es
            verändert.
          </>
        ) : (
          <>
            Ein QR-Code lässt sich auf ein anderes Blatt kopieren.{" "}
            <strong className="text-ink-900">Gültig ist nur dieser Text.</strong>{" "}
            Weicht das Dokument vor Ihnen ab, wurde es verändert.
          </>
        )}
      </p>
      <div className="mt-3 max-h-96 overflow-y-auto rounded border border-ink-100 bg-ink-50/60 p-4 text-[13px] leading-relaxed text-ink-800">
        {paragraphs.map((p, i) => (
          <p key={i} className={`whitespace-pre-line ${i > 0 ? "mt-3" : ""}`}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Freigabe einer unterzeichnenden Person. Grün nur, wenn die Freigabe-Adresse
 * an der verifizierten Firmen-Domain lag; sonst ein grauer Hinweis.
 */
export function SignatoryConfirmation({
  confirmedAt,
  unverifiedAt,
  pillClass,
}: {
  confirmedAt: string | null | undefined;
  unverifiedAt: string | null | undefined;
  pillClass: string;
}) {
  if (confirmedAt) {
    return (
      <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pillClass}`}>
        <CheckIcon />
        Freigabe über Firmen-Domain · {confirmedAt}
      </dd>
    );
  }
  if (unverifiedAt) {
    return (
      <dd className="mt-1 text-[11px] text-ink-400">
        Per E-Mail freigegeben · {unverifiedAt} · Adresse nicht geprüft
      </dd>
    );
  }
  return null;
}

/** Warnung, solange die Firmen-Domain nicht verifiziert ist. */
export function IssuerNotConfirmedNotice() {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
      <strong>Aussteller nicht bestätigt.</strong> Die ausstellende Firma hat
      weder eine Mailadresse an ihrer Domain noch ihre Domain selbst bei zeugnio
      bestätigt. Bestätigt ist nur, dass
      dieses Zeugnis so registriert wurde, nicht, dass es vom genannten
      Arbeitgeber stammt. Jede Person kann ein Konto anlegen und eine Firma unter
      beliebigem Namen erfassen. Klären Sie das im Zweifel direkt beim
      Arbeitgeber.
    </div>
  );
}

/**
 * Hinweis unter dem Arbeitgeber, solange keine Domain per DNS geprüft ist.
 * Mail-Stufe (Migration 039): Plakette «Firmen-Mailadresse @firma.ch». Sie gilt
 * als Bestätigung des Ausstellers, ist aber schwächer als die DNS-Prüfung.
 * Ohne beides: grauer Hinweis.
 */
export function DomainNotVerifiedNote({
  emailConfirmedDomain,
}: {
  emailConfirmedDomain: string | null | undefined;
}) {
  return (
    emailConfirmedDomain ? (
      <dd className="mt-1 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
        <CheckIcon />
        Firmen-Mailadresse @{emailConfirmedDomain}
      </dd>
    ) : (
      <dd className="mt-1 text-[11px] text-ink-400">Aussteller-Domain nicht bestätigt</dd>
    )
  );
}
