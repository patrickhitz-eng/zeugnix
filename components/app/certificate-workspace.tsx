"use client";

import { createContext, useContext, useRef } from "react";

/** Was der Editor den Aktionen der Detailseite anbietet. */
export interface EditorHandle {
  /** Sichert ausstehende Änderungen. Wirft, wenn das Speichern fehlschlägt. */
  flush: () => Promise<void>;
  /** Weicht die Editor-Fassung (gespeichert oder nicht) vom generierten Text ab? */
  hasEdits?: () => boolean;
  /** Bricht ein noch ausstehendes Auto-Save ab, ohne zu speichern. */
  discardPending?: () => void;
  /** Ersetzt den Inhalt durch `text`, ohne zu speichern (Server hat ihn schon). */
  replaceWithText?: (text: string) => void;
}

interface WorkspaceContext {
  /** Editor meldet sich hier an (oder mit null beim Unmount ab). */
  registerEditor: (handle: EditorHandle | null) => void;
  /** Sichert ausstehende Editor-Änderungen. Wirft, wenn das Speichern fehlschlägt. */
  flush: () => Promise<void>;
  hasEdits: () => boolean;
  discardPending: () => void;
  replaceWithText: (text: string) => void;
}

const Ctx = createContext<WorkspaceContext | null>(null);

/**
 * Klammert Editor und Aktionen einer Zeugnis-Detailseite zusammen.
 *
 * Finalisieren sichert damit zuerst den noch ausstehenden Auto-Save des Editors
 * (800ms-Debounce), sonst ginge die letzte Eingabe verloren. «Neu generieren»
 * fragt darüber, ob es im Editor Änderungen gibt, verwirft ein ausstehendes
 * Speichern und setzt den neuen Text direkt in den Editor.
 */
export function CertificateWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const editorRef = useRef<EditorHandle | null>(null);
  const value = useRef<WorkspaceContext>({
    registerEditor: (handle) => {
      editorRef.current = handle;
    },
    flush: async () => {
      if (editorRef.current) await editorRef.current.flush();
    },
    hasEdits: () => editorRef.current?.hasEdits?.() ?? false,
    discardPending: () => editorRef.current?.discardPending?.(),
    replaceWithText: (text) => editorRef.current?.replaceWithText?.(text),
  }).current;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCertificateWorkspace() {
  return useContext(Ctx);
}
