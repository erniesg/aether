'use client';

import { useEffect, useMemo, useRef } from 'react';
import { getSnapshot, loadSnapshot, Tldraw, type Editor, type TLComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from '@/app/design-system/ThemeProvider';
import { useEditorRef } from '@/lib/store/editor-ref';
import {
  loadCanvasSnapshot,
  saveCanvasSnapshot,
} from '@/lib/store/canvasSnapshots';
import { maybeSeedArtboards, seedArtboards } from '@/lib/canvas/seedArtboards';
import { SafeZoneOverlay } from './SafeZoneOverlay';

function ensureArtboards(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  if (shapes.some((shape) => shape.type === 'frame')) return [];
  if (shapes.length === 0) return maybeSeedArtboards(editor);

  const ids = seedArtboards(editor);
  try {
    editor.setSelectedShapes(ids as never);
    editor.zoomToSelection({ animation: { duration: 240 } });
    editor.setSelectedShapes([]);
  } catch {
    // best-effort framing; never throw out of a mount hook
  }
  return ids;
}

/**
 * The tldraw operator chrome we null out so the aether workspace reads as a
 * creative surface, not a pipeline inspector. NavigationPanel (bottom-right
 * page/zoom/chevron stack) is the headline removal, but the native Toolbar
 * and StylePanel also have to go because they overlap the aether rails and
 * split the hierarchy into two competing apps. Contextual media/text toolbars
 * are removed too; selected-image/artboard actions live in aether chrome.
 */
export const TLDRAW_CHROME_OVERRIDES: Partial<TLComponents> = {
  ContextMenu: null,
  MenuPanel: null,
  MainMenu: null,
  HelpMenu: null,
  PageMenu: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  ActionsMenu: null,
  HelperButtons: null,
  NavigationPanel: null,
  ZoomMenu: null,
  Minimap: null,
  SharePanel: null,
  DebugPanel: null,
  DebugMenu: null,
  TopPanel: null,
  RichTextToolbar: null,
  ImageToolbar: null,
  VideoToolbar: null,
  CursorChatBubble: null,
  FollowingIndicator: null,
  Toolbar: null,
  StylePanel: null,
};

/**
 * Minimal tldraw wrapper. aether owns the floating canvas chrome; tldraw's
 * overlapping Toolbar + StylePanel are hidden, while the editor engine and
 * keyboard shortcuts remain intact.
 *
 * Editor instance is captured once in onMount. Theme changes propagate via
 * effect on the editor ref so tldraw's UI stays in sync with the Aether
 * theme without re-mounting.
 */
export interface TldrawCanvasProps {
  workspaceKey?: string;
  safeZonesVisible?: boolean;
}

export function TldrawCanvas({
  workspaceKey = 'default',
  safeZonesVisible = false,
}: TldrawCanvasProps) {
  const { theme } = useTheme();
  const { setEditor } = useEditorRef();
  const editorRef = useRef<Editor | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const storeUnsubscribeRef = useRef<(() => void) | null>(null);
  const beforeUnloadCleanupRef = useRef<(() => void) | null>(null);
  const persistenceReadyRef = useRef(false);
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
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      storeUnsubscribeRef.current?.();
      beforeUnloadCleanupRef.current?.();
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

        const saveNow = () => {
          if (!persistenceReadyRef.current) return;
          const snapshotJson = JSON.stringify(getSnapshot(editor.store));
          void saveCanvasSnapshot(workspaceKey, snapshotJson);
        };
        const scheduleSave = () => {
          if (!persistenceReadyRef.current) return;
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(saveNow, 700);
        };

        storeUnsubscribeRef.current = editor.store.listen(scheduleSave);
        window.addEventListener('beforeunload', saveNow);
        beforeUnloadCleanupRef.current = () => {
          window.removeEventListener('beforeunload', saveNow);
        };

        ensureArtboards(editor);

        void (async () => {
          const persisted = await loadCanvasSnapshot(workspaceKey);
          if (persisted?.tldrawStoreJson) {
            try {
              persistenceReadyRef.current = false;
              loadSnapshot(editor.store, JSON.parse(persisted.tldrawStoreJson));
              ensureArtboards(editor);
            } catch (error) {
              console.error('[canvas/snapshot] restore failed', error);
              ensureArtboards(editor);
            }
          }
          persistenceReadyRef.current = true;
          scheduleSave();
        })();
      }}
      components={components}
    />
  );
}
