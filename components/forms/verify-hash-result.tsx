"use client";

import type { ReactNode } from "react";

import type {
  HashLookupCertificateFields,
  HashLookupOutcome,
} from "@/lib/hash/canonicalize";
import { RegisterNote } from "@/components/forms/register-note";

export type HashLookupState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "done"; outcome: HashLookupOutcome };

function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ResultHeader({
  tone,
  title,
  subtitle,
  icon,
}: {
  tone: "petrol" | "red" | "amber";
  title: string;
  subtitle?: string;
  icon: ReactNode;
}) {
  const bg =
    tone === "petrol" ? "bg-petrol-700" : tone === "red" ? "bg-red-700" : "bg-amber-600";
  return (
    <div className={`${bg} px-6 py-5 text-white`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          {icon}
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">
            QR-Code
          </div>
          <div className="text-[18px] font-medium">{title}</div>
          {subtitle ? <div className="text-[12px] opacity-90">{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}

function HashBox({ hash }: { hash: string }) {
  return (
    <div className="rounded-md bg-ink-50 p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
        SHA-256 Hash aus dem QR-Code
      </div>
      <div className="mt-1 break-all font-mono text-[11px]">{hash}</div>
    </div>
  );
}

/** Siegelstufe und Signatur, wie beim PDF-Abgleich plus Schlüssel-ID. */
function TrustBadges({ c }: { c: HashLookupCertificateFields }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {(c.sealVersion ?? 1) >= 2 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-petrol-100 px-2.5 py-1 text-[11px] font-medium text-petrol-800">
          Vollsiegel · Aussteller, Titel und Unterzeichnende sind hash-gesichert
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-600">
          Basissiegel · nur der Fliesstext ist hash-gesichert
        </span>
      )}
      {c.signatureState === "valid" && c.signingKeyId ? (
        <a
          href="/api/signing-keys"
          className="inline-flex items-center gap-1.5 rounded-full bg-petrol-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-petrol-800"
          title="Öffentliche zeugnio-Schlüssel ansehen"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Signatur gültig · Schlüssel <span className="font-mono">{c.signingKeyId}</span>
        </a>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-500">{label}</dt>
      {children}
    </div>
  );
}

function RegisteredFields({
  c,
  tone,
}: {
  c: HashLookupCertificateFields;
  tone: "petrol" | "red";
}) {
  const box =
    tone === "petrol"
      ? "border-petrol-200 bg-petrol-50/50"
      : "border-red-200 bg-red-50/60";
  const label = tone === "petrol" ? "text-petrol-700" : "text-red-700";
  const pill =
    tone === "petrol" ? "bg-petrol-100 text-petrol-800" : "bg-ink-100 text-ink-700";
  const value = "text-[13.5px] font-medium text-ink-800";

  return (
    <div className={`rounded-md border p-4 ${box}`}>
      <div className={`text-[10px] font-medium uppercase tracking-wider ${label}`}>
        Registrierte Angaben
      </div>
      <TrustBadges c={c} />
      <RegisterNote fromRegister={c.fromRegister} />
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {c.employeeName && (
          <Field label="Mitarbeiter/in">
            <dd className={value}>{c.employeeName}</dd>
          </Field>
        )}
        {c.employer && (
          <Field label="Arbeitgeber">
            <dd className={value}>{c.employer}</dd>
            {c.verifiedDomain ? (
              <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill}`}>
                <CheckIcon />
                Domain verifiziert · {c.verifiedDomain}
              </dd>
            ) : (
              <dd className="mt-1 text-[11px] text-ink-400">
                Aussteller-Domain nicht verifiziert
              </dd>
            )}
          </Field>
        )}
        {c.documentType && (
          <Field label="Dokument">
            <dd className={value}>{c.documentType}</dd>
          </Field>
        )}
        {c.issueDate && (
          <Field label="Ausgestellt am">
            <dd className={value}>{c.issueDate}</dd>
          </Field>
        )}
        {c.signatory1Name && (
          <Field label="Unterschrift 1">
            <dd className={value}>
              {c.signatory1Name}
              {c.signatory1Role ? `, ${c.signatory1Role}` : ""}
            </dd>
            {c.signatory1ConfirmedAt && (
              <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill}`}>
                <CheckIcon />
                Per E-Mail freigegeben · {c.signatory1ConfirmedAt}
              </dd>
            )}
          </Field>
        )}
        {c.signatory2Name && (
          <Field label="Unterschrift 2">
            <dd className={value}>
              {c.signatory2Name}
              {c.signatory2Role ? `, ${c.signatory2Role}` : ""}
            </dd>
            {c.signatory2ConfirmedAt && (
              <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill}`}>
                <CheckIcon />
                Per E-Mail freigegeben · {c.signatory2ConfirmedAt}
              </dd>
            )}
          </Field>
        )}
      </dl>
    </div>
  );
}

/** Hinterlegte Signatur passt nicht: deutlich warnen, nicht nur weglassen. */
function InvalidSignatureWarning() {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 text-[13px] leading-relaxed text-red-900">
      <strong>Signatur nicht bestätigt.</strong> Zu diesem Zeugnis ist eine
      Signatur hinterlegt, die sich mit den öffentlichen zeugnio-Schlüsseln
      nicht bestätigen lässt. Akzeptieren Sie das Zeugnis nicht ohne Rückfrage
      beim Arbeitgeber.
    </div>
  );
}

/**
 * Die Grenze des QR-Scans, offen gesagt: Der Hash belegt, dass ein Zeugnis
 * registriert ist, nicht, dass das Papier denselben Text trägt.
 */
function QrLimitNotice() {
  return (
    <div className="rounded-md border border-ink-200 bg-white p-4 text-[13px] leading-relaxed text-ink-700">
      <strong className="text-ink-900">Was der QR-Code belegt und was nicht.</strong>{" "}
      Belegt ist: Zu diesem QR-Code ist auf zeugnio.ch ein Zeugnis mit den
      obigen Angaben registriert. Nicht belegt ist, dass das Dokument vor Ihnen
      denselben Text trägt, denn ein QR-Code lässt sich auf ein anderes Blatt
      kopieren. Vergleichen Sie darum die Angaben mit dem Dokument. Auch wenn
      alle Angaben stimmen, kann der Text verändert sein. Den Text selbst prüft
      der PDF-Abgleich unten.
    </div>
  );
}

export function VerifyHashResult({
  state,
  onRetry,
}: {
  state: HashLookupState;
  onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="card p-10 text-center" role="status">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-petrol-600" />
        <div className="mt-3 text-[13px] text-ink-500">QR-Code wird geprüft…</div>
      </div>
    );
  }

  if (state.kind === "invalid") {
    return (
      <div className="card overflow-hidden">
        <ResultHeader
          tone="amber"
          title="Kein gültiger Prüfwert"
          icon={<span className="text-[18px] font-semibold">!</span>}
        />
        <div className="p-6 text-[14px] leading-relaxed text-ink-700">
          Der Link enthält keinen gültigen zeugnio-Prüfwert. Ein Prüfwert besteht
          aus 64 Zeichen (0–9, a–f). Scannen Sie den QR-Code erneut oder laden
          Sie das Zeugnis unten als PDF hoch.
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="card p-6 text-center">
        <div className="text-[14px] text-red-700">{state.message}</div>
        <button onClick={onRetry} className="btn-secondary mt-4 text-[13px]">
          Erneut prüfen
        </button>
      </div>
    );
  }

  const outcome = state.outcome;

  if (outcome.result === "unknown") {
    return (
      <div className="card overflow-hidden">
        <ResultHeader
          tone="amber"
          title="Nicht registriert"
          icon={<span className="text-[18px] font-semibold">?</span>}
        />
        <div className="space-y-4 p-6">
          <p className="text-[14px] leading-relaxed text-ink-700">
            Zu diesem QR-Code ist auf zeugnio.ch kein ausgestelltes Zeugnis
            registriert. Möglich sind ein beschädigter oder abgetippter Code, ein
            noch nicht finalisiertes Zeugnis oder eine Fälschung. Klären Sie das
            im Zweifel direkt beim Arbeitgeber.
          </p>
          <HashBox hash={outcome.hash} />
        </div>
      </div>
    );
  }

  const c = outcome.certificate;

  if (outcome.result === "revoked") {
    const revokedDate = outcome.revokedAt
      ? new Date(outcome.revokedAt).toLocaleDateString("de-CH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null;
    return (
      <div className="card overflow-hidden">
        <ResultHeader
          tone="red"
          title="Widerrufen"
          subtitle={revokedDate ? `am ${revokedDate}` : undefined}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          }
        />
        <div className="space-y-4 p-6">
          <p className="text-[14px] leading-relaxed text-ink-700">
            Zu diesem QR-Code ist ein Zeugnis registriert, das der Aussteller
            nachträglich widerrufen hat. Es sollte nicht mehr als gültiger
            Nachweis akzeptiert werden.
          </p>
          {c.signatureState === "invalid" && <InvalidSignatureWarning />}
          <RegisteredFields c={c} tone="red" />
          <HashBox hash={outcome.hash} />
        </div>
      </div>
    );
  }

  // verified
  // Als bestätigt gilt der Aussteller nur mit verifizierter Firmen-Domain (V1)
  // oder per E-Mail freigegebener Unterschrift (V2), wie beim PDF-Abgleich.
  const issuerConfirmed = Boolean(
    c.verifiedDomain || c.signatory1ConfirmedAt || c.signatory2ConfirmedAt,
  );
  return (
    <div className="card overflow-hidden">
      <ResultHeader
        tone="petrol"
        title="Registriertes Zeugnis gefunden"
        subtitle={issuerConfirmed ? "Aussteller bestätigt" : "Aussteller nicht bestätigt"}
        icon={<CheckIcon size={20} />}
      />
      <div className="space-y-4 p-6">
        <p className="text-[14px] leading-relaxed text-ink-700">
          Zu diesem QR-Code ist auf zeugnio.ch ein gültiges Arbeitszeugnis
          registriert. Vergleichen Sie die Angaben mit dem Dokument, das vor
          Ihnen liegt.
        </p>
        {c.signatureState === "invalid" && <InvalidSignatureWarning />}
        {!issuerConfirmed && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
            <strong>Aussteller nicht bestätigt.</strong> Die ausstellende Firma
            hat weder ihre E-Mail-Domain bei zeugnio verifiziert, noch haben die
            Unterzeichnenden das Zeugnis per E-Mail freigegeben. Bestätigt ist
            nur, dass dieses Zeugnis so registriert wurde, nicht, dass es vom
            genannten Arbeitgeber stammt. Klären Sie das im Zweifel direkt beim
            Arbeitgeber.
          </div>
        )}
        <RegisteredFields c={c} tone="petrol" />
        <QrLimitNotice />
        <HashBox hash={outcome.hash} />
      </div>
    </div>
  );
}
