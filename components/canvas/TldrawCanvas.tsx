'use client';

import { useEffect, useRef } from 'react';
import { Tldraw, type Editor, type TLComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from '@/app/design-system/ThemeProvider';
import { useEditorRef } from '@/lib/store/editor-ref';
import { maybeSeedArtboards } from '@/lib/canvas/seedArtboards';

/**
 * The tldraw operator chrome we null out so the aether workspace reads as a
 * creative surface, not a pipeline inspector. NavigationPanel (bottom-right
 * page/zoom/chevron stack) is the headline removal — it's operator chrome.
 *
 * Kept intentionally: tldraw's native bottom Toolbar (primitives — select,
 * hand, draw, shape, text, eraser, arrow, frame, etc.), StylePanel (opacity,
 * colour, alignment, distribute, arrange, z-order), and ContextMenu (native
 * right-click still Just Works for power users). Reusing these keeps CLAUDE.md
 * hard rule "reuse from tldraw as much as possible" honest — we don't
 * reinvent primitives the engine already ships.
 */
export const TLDRAW_CHROME_OVERRIDES: Partial<TLComponents> = {
  MenuPanel: null,
  MainMenu: null,
  HelpMenu: null,
  PageMenu: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  ActionsMenu: null,
  NavigationPanel: null,
  ZoomMenu: null,
  SharePanel: null,
  DebugPanel: null,
};

/**
 * Minimal tldraw wrapper. Native bottom Toolbar + StylePanel stay so creators
 * have primitive editing tools (select/hand/shapes/text/zoom, opacity,
 * arrange, distribute, z-order) — the Aether FloatingToolbar owns AI verbs.
 * See docs/ARCHITECTURE and CLAUDE.md hard rule 6.
 *
 * Editor instance is captured once in onMount. Theme changes propagate via
 * effect on the editor ref so tldraw's UI stays in sync with the Aether
 * theme without re-mounting.
 */
export function TldrawCanvas() {
  const { theme } = useTheme();
  const { setEditor } = useEditorRef();
  const editorRef = useRef<Editor | null>(null);

  // Keep tldraw's internal colour scheme aligned with the Aether theme.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
  }, [theme]);

  return (
    <Tldraw
      className="absolute inset-0"
      inferDarkMode={false}
      options={{ maxPages: 1 }}
      onMount={(editor: Editor) => {
        editorRef.current = editor;
        setEditor(editor);
        editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
        // Seed the four hero artboards on an empty workspace so the multiformat
        // promise is visible on first paint. No-op if the page already has shapes.
        maybeSeedArtboards(editor);
      }}
      components={TLDRAW_CHROME_OVERRIDES}
    />
  );
}
