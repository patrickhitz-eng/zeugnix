"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
import { useCertificateWorkspace } from "./certificate-workspace";
import { CertificatePreview } from "./certificate-preview";
import {
  plainTextToTiptap,
  tiptapToPlainText,
  type TiptapDoc,
} from "@/lib/certificate/tiptap-plaintext";
import { fontConfig } from "@/lib/pdf/fonts";
import {
  resolveTheme,
  BASE_TOKENS as T,
  cssPt,
  cssLh,
} from "@/lib/design/document-tokens";

interface Props {
  certificateId: string;
  generatedText: string;
  initialFormattedContent?: TiptapDoc | null;
  finalized: boolean;
  /** Theme des Dokuments; versteht auch die Alt-Font-Keys. */
  themeId?: string | null;
  // Daten für die A4-Vorschau
  company: any;
  employee: any;
  type: string;
  hash?: string | null;
  /** Unterschrifts-Modus; steuert den Kopf „Digital ausgestellt durch" in der Vorschau. */
  signatureMode?: string | null;
}

type SaveStatus = "idle" | "typing" | "saving" | "saved" | "error";

export function CertificateRichWorkspace({
  certificateId,
  generatedText,
  initialFormattedContent,
  finalized,
  themeId,
  company,
  employee,
  type,
  hash,
  signatureMode,
}: Props) {
  const router = useRouter();
  const workspace = useCertificateWorkspace();

  // Schrift und Farbe kommen aus dem Theme, nicht aus freier Nutzerwahl.
  const theme = resolveTheme(themeId);
  const editorFont = fontConfig(theme.fonts.body).css;
  const editorColor = theme.colors.textPrimary;

  const initialDoc: TiptapDoc =
    initialFormattedContent ?? plainTextToTiptap(generatedText);

  const [doc, setDoc] = useState<TiptapDoc>(initialDoc);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [, setTick] = useState(0); // erzwingt Toolbar-Re-Render bei Selektion

  const jsonRef = useRef<TiptapDoc>(initialDoc);
  const lastSavedRef = useRef<string>(JSON.stringify(initialDoc));
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const previewTimer = useRef<NodeJS.Timeout | null>(null);

  const saveNow = useCallback(async () => {
    if (finalized) return;
    const json = jsonRef.current;
    const serialized = JSON.stringify(json);
    if (serialized === lastSavedRef.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setStatus("saving");
    try {
      const res = await fetch(`/api/certificates/${certificateId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatted_content: json }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Speichern fehlgeschlagen");
      }
      lastSavedRef.current = serialized;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message);
      throw err;
    }
  }, [certificateId, finalized]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !finalized,
    // italic: false entfernt Mark UND Tastenkürzel (Ctrl/Cmd+I). Begründung
    // siehe lib/certificate/tiptap-runs.ts. TextStyle/Color/FontFamily bleiben
    // registriert, damit Marks aus Alt-Dokumenten weiter geparst werden – die
    // Bedienelemente dazu sind aus der Toolbar entfernt.
    extensions: [StarterKit.configure({ italic: false }), TextStyle, Color, FontFamily],
    content: initialDoc,
    editorProps: {
      attributes: {
        class: "zeugnix-doc-editable",
        spellcheck: "true",
        lang: "de-CH",
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as TiptapDoc;
      jsonRef.current = json;
      // Vorschau leicht gedrosselt aktualisieren
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setDoc(json), 120);
      // Speichern debounced
      setStatus("typing");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveNow().catch(() => {});
      }, 800);
    },
    onSelectionUpdate: () => setTick((t) => t + 1),
  });

  // saveNow beim Workspace registrieren (Finalisieren flusht ausstehende Saves).
  useEffect(() => {
    if (!workspace) return;
    workspace.registerFlush(saveNow);
    return () => workspace.registerFlush(null);
  }, [workspace, saveNow]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

  async function resetToGenerated() {
    if (
      !confirm(
        "Formatierung und Bearbeitung verwerfen und auf den generierten Text zurücksetzen?",
      )
    )
      return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/certificates/${certificateId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatted_content: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Zurücksetzen fehlgeschlagen");
      }
      const fresh = plainTextToTiptap(generatedText);
      editor?.commands.setContent(fresh);
      jsonRef.current = fresh;
      lastSavedRef.current = JSON.stringify(fresh);
      setDoc(fresh);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
      router.refresh();
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  }

  const previewText = tiptapToPlainText(doc);
  const trimmedText = previewText.trim();
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const charCount = trimmedText.length;
  // Schweizer Praxis: ein sehr knappes Zeugnis wirkt zurückhaltend/negativ.
  // Dezenter Nudge, sobald der Text auffällig kurz ist (grobe Heuristik).
  const tooShort = wordCount > 0 && wordCount < 150;

  return (
    <div className="mx-auto max-w-[900px] space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {finalized ? "Zeugnis" : "Direkt im Dokument bearbeiten"}
        </div>
        <div className="text-[12px]">
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
      </div>

      {!finalized && <Toolbar editor={editor} />}

      {/* So wird auch das PDF aussehen: Bearbeitung passiert direkt im
          A4-Blatt statt in einem separaten, andersartig skalierten Feld
          daneben – ein Rendering, keine zwei Wahrheiten. */}
      <CertificatePreview
        company={company}
        employee={employee}
        type={type}
        text={previewText}
        hash={hash}
        signatureMode={signatureMode}
        bodyOverride={
          <div
            className="zeugnix-doc-editable-wrap"
            style={{ fontFamily: editorFont, color: editorColor }}
          >
            <EditorContent editor={editor} />
          </div>
        }
        themeId={themeId}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
        <span>
          {wordCount} {wordCount === 1 ? "Wort" : "Wörter"} · {charCount} Zeichen
        </span>
        {tooShort && (
          <span className="text-amber-700">
            Eher kurz – je knapper ein Zeugnis, desto zurückhaltender wirkt es.
          </span>
        )}
      </div>

      {!finalized && (
        <button
          onClick={resetToGenerated}
          className="text-[11.5px] font-medium text-ink-600 underline hover:text-ink-900"
        >
          Auf generierten Text zurücksetzen
        </button>
      )}
      {finalized && (
        <p className="text-[11.5px] text-ink-500">
          Das Zeugnis ist finalisiert. Bearbeitung nicht mehr möglich.
        </p>
      )}

      {/* Typografie deckungsgleich mit den Druck-Tokens (document-tokens.ts),
          damit das Editieren im Blatt exakt zeigt, was im PDF landet. */}
      <style>{`
        .zeugnix-doc-editable { outline: none; }
        .zeugnix-doc-editable p {
          margin: 0 0 ${cssPt(T.space.paragraphMarginBottom)} 0;
          font-size: ${cssPt(T.fontSize.body)};
          line-height: ${cssLh(T.lineHeight.body)};
        }
        .zeugnix-doc-editable ul {
          list-style: none;
          margin: 0 0 ${cssPt(T.space.paragraphMarginBottom)} 0;
          padding-left: 0;
        }
        .zeugnix-doc-editable li {
          position: relative;
          margin: 0 0 ${cssPt(T.space.bulletMarginBottom)} 0;
          padding-left: ${cssPt(T.space.bulletMarginLeft)};
          font-size: ${cssPt(T.fontSize.body)};
          line-height: ${cssLh(T.lineHeight.body)};
        }
        .zeugnix-doc-editable li::before {
          content: "•";
          position: absolute;
          left: 0;
        }
      `}</style>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Toolbar
// ----------------------------------------------------------------------------

/**
 * Bewusst auf Fett und Unterstrichen begrenzt.
 *
 * - Schriftart und Schriftfarbe bestimmt das Theme der Firma, nicht die
 *   einzelne Textstelle. Ein freier Font-/Farbwähler pro Run erzeugt genau die
 *   uneinheitlichen Dokumente, die ein Designsystem verhindern soll.
 * - Kursiv ist im Arbeitszeugnis fachlich unzulässig (siehe tiptap-runs.ts).
 */
function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2.5 py-1 text-[13px] font-medium border ${
      active
        ? "border-petrol-500 bg-petrol-50 text-petrol-700"
        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50/50 p-2">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
        title="Fett"
        style={{ fontWeight: 700 }}
      >
        F
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive("underline"))}
        title="Unterstrichen"
        style={{ textDecoration: "underline" }}
      >
        U
      </button>

      <span className="ml-1 text-[11.5px] text-ink-500">
        Schrift und Farbe folgen dem Firmen-Stil.
      </span>
    </div>
  );
}
