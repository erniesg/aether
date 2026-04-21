'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Editor } from 'tldraw';

/**
 * A tiny context so the composer can drop generated images onto the canvas
 * without prop-drilling the tldraw Editor through every component.
 */

type Ctx = {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
};

const EditorRefContext = createContext<Ctx | null>(null);

export function EditorRefProvider({ children }: { children: ReactNode }) {
  const [editor, setEditorState] = useState<Editor | null>(null);
  const setEditor = useCallback((e: Editor | null) => setEditorState(e), []);
  const value = useMemo(() => ({ editor, setEditor }), [editor, setEditor]);
  return <EditorRefContext.Provider value={value}>{children}</EditorRefContext.Provider>;
}

export function useEditorRef(): Ctx {
  const ctx = useContext(EditorRefContext);
  if (!ctx) throw new Error('useEditorRef must be used inside <EditorRefProvider>');
  return ctx;
}
