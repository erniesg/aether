'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Tldraw, type Editor, type TLComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from '@/app/design-system/ThemeProvider';
import { useEditorRef } from '@/lib/store/editor-ref';
import { maybeSeedArtboards } from '@/lib/canvas/seedArtboards';
import { SafeZoneOverlay } from './SafeZoneOverlay';

/**
 * The tldraw operator chrome we null out so the aether workspace reads as a
 * creative surface, not a pipeline inspector. NavigationPanel (bottom-right
 * page/zoom/chevron stack) is the headline removal, but the native Toolbar
 * and StylePanel also have to go because they overlap the aether rails and
 * split the hierarchy into two competing apps. We keep ContextMenu so power
 * users still have a native escape hatch.
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
  Toolbar: null,
  StylePanel: null,
};

/**
 * Minimal tldraw wrapper. aether owns the floating canvas chrome; tldraw's
 * overlapping Toolbar + StylePanel are hidden, while the editor engine,
 * context menu, and keyboard shortcuts remain intact.
 *
 * Editor instance is captured once in onMount. Theme changes propagate via
 * effect on the editor ref so tldraw's UI stays in sync with the Aether
 * theme without re-mounting.
 */
export interface TldrawCanvasProps {
  safeZonesVisible?: boolean;
}

export function TldrawCanvas({ safeZonesVisible = false }: TldrawCanvasProps) {
  const { theme } = useTheme();
  const { setEditor } = useEditorRef();
  const editorRef = useRef<Editor | null>(null);
  const components = useMemo<Partial<TLComponents>>(
    () => ({
      ...TLDRAW_CHROME_OVERRIDES,
      InFrontOfTheCanvas: () => <SafeZoneOverlay visible={safeZonesVisible} />,
    }),
    [safeZonesVisible]
  );

  // Keep tldraw's internal colour scheme aligned with the Aether theme.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
  }, [theme]);

  useEffect(() => {
    return () => {
      setEditor(null);
      if (typeof window !== 'undefined') {
        (
          window as Window & {
            __AETHER_EDITOR__?: Editor | null;
          }
        ).__AETHER_EDITOR__ = null;
      }
    };
  }, [setEditor]);

  return (
    <Tldraw
      className="absolute inset-0"
      inferDarkMode={false}
      options={{ maxPages: 1 }}
      onMount={(editor: Editor) => {
        editorRef.current = editor;
        setEditor(editor);
        editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
        if (typeof window !== 'undefined') {
          (
            window as Window & {
              __AETHER_EDITOR__?: Editor | null;
            }
          ).__AETHER_EDITOR__ = editor;
        }
        // Seed the four hero artboards on an empty workspace so the multiformat
        // promise is visible on first paint. No-op if the page already has shapes.
        maybeSeedArtboards(editor);
      }}
      components={components}
    />
  );
}
