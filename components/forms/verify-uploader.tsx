"use client";

import { useState, useRef } from "react";

type State =
  | { kind: "idle" }
  | { kind: "extracting"; fileName: string }
  | { kind: "checking"; fileName: string }
  | { kind: "verified"; hash: string; certificateId: string }
  | { kind: "unknown"; hash: string }
  | { kind: "error"; message: string };

export function VerifyUploader() {
  const [state, setState] = useState<State>({ kind: "idle" });
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
        });
      } else {
        setState({ kind: "unknown", hash: data.calculatedHash });
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
    if (inputRef.current) inputRef.current.value = "";
  }

  // ----- Result-Anzeigen -----
  if (state.kind === "verified") {
    return (
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
            Der berechnete Hash dieses Dokuments stimmt mit einem auf zeugnix.ch
            registrierten Arbeitszeugnis überein. Der Inhalt wurde seit der
            Ausstellung nicht verändert.
          </p>
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
    );
  }

  if (state.kind === "unknown") {
    return (
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
            Wir konnten kein passendes Original auf zeugnix.ch finden. Das
            bedeutet entweder:
          </p>
          <ul className="ml-5 list-disc space-y-1.5 text-[13.5px] text-ink-700">
            <li>Das Zeugnis wurde nicht über zeugnix.ch erstellt.</li>
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
