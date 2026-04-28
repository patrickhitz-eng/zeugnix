"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  certificateId: string;
  generatedText: string;
  initialEditedText?: string | null;
  finalized: boolean;
}

type SaveStatus = "idle" | "typing" | "saving" | "saved" | "error";

export function CertificateEditor({
  certificateId,
  generatedText,
  initialEditedText,
  finalized,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialEditedText ?? generatedText);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(text);

  const isEdited = !!initialEditedText && initialEditedText !== generatedText;

  useEffect(() => {
    if (finalized) return; // kein Auto-Save bei finalisiertem Zeugnis
    if (text === lastSavedRef.current) return;

    setStatus("typing");
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/certificates/${certificateId}/text`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edited_text: text }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Speichern fehlgeschlagen");
        }
        lastSavedRef.current = text;
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message);
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function resetToGenerated() {
    if (!confirm("Manuelle Bearbeitung verwerfen und auf den generierten Text zurücksetzen?")) {
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch(`/api/certificates/${certificateId}/text`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_text: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Zurücksetzen fehlgeschlagen");
      }
      setText(generatedText);
      lastSavedRef.current = generatedText;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
      router.refresh();
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  }

  return (
    <div className="space-y-3">
      {/* Status-Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px]">
          {isEdited ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              Manuell bearbeitet
            </span>
          ) : (
            <span className="rounded-full bg-petrol-50 px-2.5 py-1 text-[11px] font-medium text-petrol-700">
              Automatisch generiert
            </span>
          )}
          {status === "typing" && <span className="text-ink-400">Tippt…</span>}
          {status === "saving" && (
            <span className="text-ink-500">Wird gespeichert…</span>
          )}
          {status === "saved" && (
            <span className="text-petrol-700">✓ Gespeichert</span>
          )}
          {status === "error" && (
            <span className="text-red-700">Fehler: {errorMsg}</span>
          )}
        </div>
        {isEdited && !finalized && (
          <button
            onClick={resetToGenerated}
            className="text-[11.5px] font-medium text-ink-600 underline hover:text-ink-900"
          >
            Auf generierten Text zurücksetzen
          </button>
        )}
      </div>

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={finalized}
        rows={20}
        className="font-display w-full resize-y rounded-md border border-ink-200 bg-white px-5 py-4 text-[14px] leading-relaxed text-ink-800 outline-none focus:border-petrol-500 focus:ring-2 focus:ring-petrol-100 disabled:bg-ink-50 disabled:text-ink-500"
        spellCheck
        lang="de-CH"
        placeholder="Der generierte Zeugnistext erscheint hier…"
      />

      {finalized && (
        <p className="text-[11.5px] text-ink-500">
          Das Zeugnis ist finalisiert. Bearbeitung nicht mehr möglich.
        </p>
      )}
    </div>
  );
}
