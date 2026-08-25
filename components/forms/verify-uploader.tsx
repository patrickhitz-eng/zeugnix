"use client";

import { useState, useRef } from "react";
import type { AnalysisResult } from "@/lib/phrases/analyze";
import type { VerifiedCertificateFields } from "@/lib/hash/canonicalize";
import { VerifyAnalysisResult } from "@/components/forms/verify-analysis-result";

type State =
  | { kind: "idle" }
  | { kind: "extracting"; fileName: string }
  | { kind: "checking"; fileName: string }
  | {
      kind: "verified";
      hash: string;
      certificateId: string;
      certificate: VerifiedCertificateFields | null;
    }
  | { kind: "unknown"; hash: string }
  | { kind: "no_sentinel"; message: string }
  | { kind: "error"; message: string };

export function VerifyUploader({ tier }: { tier?: "premium" | "analyse" }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      setState({
        kind: "error",
        message: "Bitte laden Sie eine PDF-Datei hoch.",
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setState({
        kind: "error",
        message: "Datei zu gross (max. 15 MB).",
      });
      return;
    }

    setState({ kind: "extracting", fileName: file.name });

    try {
      // pdfjs-dist im Browser laden
      const pdfjsLib = await import("pdfjs-dist");
      // Worker via CDN (für MVP einfach; produktiv eigenes Hosting)
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it: any) => ("str" in it ? it.str : ""))
          .join(" ");
        fullText += pageText + "\n";
      }

      if (fullText.trim().length < 50) {
        setState({
          kind: "error",
          message:
            "Das PDF enthält keinen erkennbaren Text. Möglicherweise handelt es sich um ein gescanntes Dokument. OCR wird in einer späteren Version unterstützt.",
        });
        return;
      }

      setState({ kind: "checking", fileName: file.name });

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText }),
      });

      if (!res.ok) {
        const data = await res.json();
        setState({ kind: "error", message: data.error ?? "Prüfung fehlgeschlagen" });
        return;
      }

      const data = await res.json();

      if (data.result === "verified") {
        setState({
          kind: "verified",
          hash: data.matchedHash,
          certificateId: data.matchedCertificateId,
          certificate: data.certificate ?? null,
        });
      } else if (data.result === "no_sentinel") {
        setState({
          kind: "no_sentinel",
          message: data.error ?? "Keine Echtheitsmarker im PDF gefunden.",
        });
      } else {
        setState({ kind: "unknown", hash: data.calculatedHash });
      }

      // Klartext-Analyse nur für Premium-/Analyse-Tier. Nutzt denselben bereits
      // extrahierten Text. Ein Analyse-Fehler ist nicht fatal – das
      // Verify-Resultat bleibt bestehen.
      if (tier) {
        setAnalyzing(true);
        try {
          const ares = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: fullText }),
          });
          if (ares.ok) {
            const adata = await ares.json();
            setAnalysis(adata.analysis ?? null);
          }
        } catch {
          // bewusst geschluckt – Analyse ist optional
        } finally {
          setAnalyzing(false);
        }
      }
    } catch (err: any) {
      setState({
        kind: "error",
        message: err.message ?? "Unbekannter Fehler bei der Verarbeitung",
      });
    }
  }

  function reset() {
    setState({ kind: "idle" });
    setAnalysis(null);
    setAnalyzing(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Analyse-Block (Ladezustand oder Ergebnis), nur bei Premium-/Analyse-Tier.
  const analysisBlock =
    tier && (analyzing || analysis) ? (
      <div className="mt-4">
        {analysis ? (
          <VerifyAnalysisResult result={analysis} />
        ) : (
          <div className="card p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-petrol-600" />
            <div className="mt-3 text-[13px] text-ink-500">
              Analyse wird erstellt…
            </div>
          </div>
        )}
      </div>
    ) : null;

  // ----- Result-Anzeigen -----
  if (state.kind === "verified") {
    return (
      <>
      <div className="card overflow-hidden">
        <div className="bg-petrol-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">Resultat</div>
              <div className="text-[18px] font-medium">Echt – Hash stimmt überein</div>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-[14px] leading-relaxed text-ink-700">
            Der berechnete Hash dieses Dokuments stimmt mit einem auf zeugnio.ch
            registrierten Arbeitszeugnis überein. Der Inhalt wurde seit der
            Ausstellung nicht verändert.
          </p>
          {state.certificate && (
            <div className="rounded-md border border-petrol-200 bg-petrol-50/50 p-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-petrol-700">
                Registrierte Angaben
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
                Bitte mit dem vorliegenden Dokument vergleichen. Weichen
                Arbeitgeber, Unterzeichnende oder Titel vom Papier ab, wurde das
                Dokument nachträglich verändert – trotz übereinstimmendem Hash.
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {state.certificate.employeeName && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Mitarbeiter/in</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.employeeName}
                    </dd>
                  </div>
                )}
                {state.certificate.employer && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Arbeitgeber</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.employer}
                    </dd>
                  </div>
                )}
                {state.certificate.documentType && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Dokument</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.documentType}
                    </dd>
                  </div>
                )}
                {state.certificate.issueDate && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Ausgestellt am</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.issueDate}
                    </dd>
                  </div>
                )}
                {state.certificate.signatory1Name && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Unterschrift 1</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.signatory1Name}
                      {state.certificate.signatory1Role
                        ? `, ${state.certificate.signatory1Role}`
                        : ""}
                    </dd>
                  </div>
                )}
                {state.certificate.signatory2Name && (
                  <div>
                    <dt className="text-[11px] text-ink-500">Unterschrift 2</dt>
                    <dd className="text-[13.5px] font-medium text-ink-800">
                      {state.certificate.signatory2Name}
                      {state.certificate.signatory2Role
                        ? `, ${state.certificate.signatory2Role}`
                        : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          <div className="rounded-md bg-ink-50 p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
              SHA-256 Hash
            </div>
            <div className="mt-1 break-all font-mono text-[11px]">{state.hash}</div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[12.5px] text-amber-900">
            <strong>Hinweis:</strong> Die Verifikation bestätigt die Identität
            des Inhalts mit dem registrierten Original. Sie bestätigt nicht die
            materielle Richtigkeit der Aussagen im Zeugnis.
          </div>
          <button onClick={reset} className="btn-secondary text-[13px]">
            Weiteres Dokument prüfen
          </button>
        </div>
      </div>
      {analysisBlock}
      </>
    );
  }

  if (state.kind === "unknown") {
    return (
      <>
      <div className="card overflow-hidden">
        <div className="bg-amber-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">Resultat</div>
              <div className="text-[18px] font-medium">Nicht in Datenbank</div>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-[14px] leading-relaxed text-ink-700">
            Wir konnten kein passendes Original auf zeugnio.ch finden. Das
            bedeutet entweder:
          </p>
          <ul className="ml-5 list-disc space-y-1.5 text-[13.5px] text-ink-700">
            <li>Das Zeugnis wurde nicht über zeugnio.ch erstellt.</li>
            <li>Das Zeugnis wurde nach der Ausstellung verändert.</li>
            <li>Das Zeugnis stammt von einem anderen Aussteller.</li>
          </ul>
          <div className="rounded-md bg-ink-50 p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
              Berechneter Hash
            </div>
            <div className="mt-1 break-all font-mono text-[11px]">{state.hash}</div>
          </div>
          <button onClick={reset} className="btn-secondary text-[13px]">
            Anderes Dokument prüfen
          </button>
        </div>
      </div>
      {analysisBlock}
      </>
    );
  }

  if (state.kind === "no_sentinel") {
    return (
      <>
      <div className="card overflow-hidden">
        <div className="bg-ink-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">Resultat</div>
              <div className="text-[18px] font-medium">Keine Echtheitsmarker</div>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-[14px] leading-relaxed text-ink-700">
            {state.message}
          </p>
          <button onClick={reset} className="btn-secondary text-[13px]">
            Anderes Dokument prüfen
          </button>
        </div>
      </div>
      {analysisBlock}
      </>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="card p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-[13.5px] text-red-800">
          <div className="font-medium">Fehler bei der Prüfung</div>
          <div className="mt-1">{state.message}</div>
        </div>
        <button onClick={reset} className="btn-secondary mt-4 text-[13px]">
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (state.kind === "extracting" || state.kind === "checking") {
    return (
      <div className="card p-10 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-ink-200 border-t-petrol-600" />
        <div className="mt-4 text-[14px] font-medium">
          {state.kind === "extracting"
            ? "Text wird extrahiert…"
            : "Hash wird berechnet und geprüft…"}
        </div>
        <div className="mt-1 text-[12px] text-ink-500">{state.fileName}</div>
      </div>
    );
  }

  // Idle – Dropzone
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`card flex cursor-pointer flex-col items-center justify-center px-8 py-16 text-center transition-colors ${
        dragActive
          ? "border-petrol-600 bg-petrol-50"
          : "hover:border-ink-300 hover:bg-ink-50/30"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-petrol-50 text-petrol-700">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <div className="mt-4 text-[15px] font-medium">
        PDF hierher ziehen oder klicken zum Auswählen
      </div>
      <div className="mt-1 text-[12.5px] text-ink-500">
        Maximale Dateigrösse 15 MB. Text-PDFs werden direkt im Browser
        verarbeitet.
      </div>
    </div>
  );
}
