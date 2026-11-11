"use client";

import { useCallback, useEffect, useState } from "react";
import {
  normalizeVerifyHash,
  readHashFromFragment,
  type HashLookupOutcome,
} from "@/lib/hash/canonicalize";
import { VerifyUploader } from "@/components/forms/verify-uploader";
import {
  VerifyHashResult,
  type HashLookupState,
} from "@/components/forms/verify-hash-result";

type Tier = "premium" | "analyse";

/**
 * Prüfwert aus der Adresse.
 *   undefined = noch nicht gelesen (Server-Render, vor dem ersten Effekt)
 *   null      = die Adresse enthält keinen Prüfwert
 *   { hash: null } = sie enthält einen, aber keinen gültigen
 */
type QrParam = { hash: string | null } | null;

/**
 * Ablauf der Prüfseite.
 *
 * Ohne Prüfwert in der Adresse: nur der PDF-Abgleich, wie bisher.
 *
 * Mit Prüfwert (QR-Scan): zuerst das Ergebnis zum QR-Code, darunter der
 * PDF-Abgleich mit dem QR-Hash als Erwartung. So sieht die prüfende Person
 * sofort, ob ein Zeugnis registriert ist, und kann danach den Text binden.
 *
 * Neue PDFs tragen den Hash im Fragment (`#hash=`), das der Server nie sieht.
 * Darum liest diese Komponente die Adresse erst im Browser. Alte PDFs tragen
 * `?hash=`; den Wert reicht die Seite als `queryHash` durch.
 */
export function VerifyFlow({
  tier,
  queryHash,
}: {
  tier?: Tier;
  queryHash?: string;
}) {
  const [qr, setQr] = useState<QrParam | undefined>(undefined);
  const [lookup, setLookup] = useState<HashLookupState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [uploadedHash, setUploadedHash] = useState<string | null>(null);

  // 1. Prüfwert aus der Adresse lesen, auch wenn sich das Fragment ändert.
  useEffect(() => {
    function read() {
      const fromFragment = readHashFromFragment(window.location.hash);
      const raw = fromFragment ?? queryHash ?? null;
      if (raw === null) {
        setQr(null);
        return;
      }
      const hash = normalizeVerifyHash(raw);
      setQr({ hash });

      // Alter Link mit ?hash=: in #hash= umschreiben. Der Server hat den Wert
      // schon gesehen, aber so bleibt er nicht als Query in Verlauf und
      // Lesezeichen stehen und wird beim Neuladen nicht erneut übertragen.
      if (fromFragment === null && hash) {
        const url = new URL(window.location.href);
        url.searchParams.delete("hash");
        url.hash = new URLSearchParams({ hash }).toString();
        window.history.replaceState(window.history.state, "", url.toString());
      }
    }
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [queryHash]);

  const hash = qr?.hash ?? null;

  // 2. Hash nachschlagen. POST, damit er nicht in der Anfrage-URL steht.
  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    setLookup({ kind: "loading" });
    setUploadedHash(null);
    (async () => {
      try {
        const res = await fetch("/api/verify/hash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLookup({
            kind: "error",
            message: data?.error ?? "Die Prüfung ist fehlgeschlagen.",
          });
          return;
        }
        setLookup({ kind: "done", outcome: data as HashLookupOutcome });
      } catch {
        if (!cancelled) {
          setLookup({
            kind: "error",
            message: "Keine Verbindung zu zeugnio.ch. Bitte erneut versuchen.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hash, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Vor dem ersten Effekt ist offen, ob ein Fragment da ist. Platz halten statt
  // erst den Upload und dann das QR-Ergebnis zu zeigen.
  if (qr === undefined) {
    return <div className="mt-12 min-h-[280px]" aria-hidden="true" />;
  }

  if (qr === null) {
    return (
      <div className="mt-12">
        <VerifyUploader tier={tier} />
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-12">
      <div>
        <div className="eyebrow mb-3">Schritt 1 · Angaben zum QR-Code</div>
        <VerifyHashResult
          state={hash ? lookup : { kind: "invalid" }}
          onRetry={retry}
        />
      </div>

      <div>
        <div className="eyebrow mb-3">Schritt 2 · Text abgleichen</div>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-600">
          Liegt Ihnen das Zeugnis als PDF vor? Laden Sie es hoch. Wir prüfen
          dann, ob es Wort für Wort das Dokument zu diesem QR-Code ist.
        </p>
        {hash && uploadedHash ? (
          <QrMatchBanner matches={uploadedHash === hash} />
        ) : null}
        <VerifyUploader tier={tier} onResultHash={setUploadedHash} />
      </div>
    </div>
  );
}

/**
 * Verbindet die zwei Schritte: Gehört das hochgeladene PDF zum gescannten
 * QR-Code? Steht über dem Upload-Resultat, weil dieses für sich allein auch
 * „echt" melden kann, wenn das PDF ein ANDERES echtes Zeugnis ist.
 */
function QrMatchBanner({ matches }: { matches: boolean }) {
  if (matches) {
    return (
      <div className="mb-4 rounded-md border border-petrol-300 bg-petrol-50 p-4 text-[13.5px] leading-relaxed text-petrol-900">
        <strong>Dieses PDF gehört zum gescannten QR-Code.</strong> Der Text des
        PDFs ergibt genau den Hash aus dem QR-Code.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-[13.5px] leading-relaxed text-red-900">
      <strong>Dieses PDF gehört nicht zum gescannten QR-Code.</strong> Der Text
      des PDFs ergibt einen anderen Hash als der QR-Code. Entweder ist es ein
      anderes Dokument, oder der QR-Code wurde auf ein fremdes Dokument
      übertragen. Das Resultat unten bezieht sich auf das PDF, nicht auf den
      QR-Code.
    </div>
  );
}
