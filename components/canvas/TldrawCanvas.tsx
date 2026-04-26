'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  AssetRecordType,
  Tldraw,
  createShapeId,
  type Editor,
  type TLAnyShapeUtilConstructor,
  type TLComponents,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from '@/app/design-system/ThemeProvider';
import { useEditorRef } from '@/lib/store/editor-ref';
import { maybeSeedArtboards } from '@/lib/canvas/seedArtboards';
import { SafeZoneOverlay } from './SafeZoneOverlay';
import { AetherTextShapeUtil } from './shapes/AetherTextShape';

/**
 * Custom tldraw shape utils registered alongside the defaults. Today the only
 * entry is the multilingual text overlay; future canvas-native primitives
 * (sketch-to-component, voice notes, etc.) join here.
 */
export const AETHER_SHAPE_UTILS: ReadonlyArray<TLAnyShapeUtilConstructor> = [
  AetherTextShapeUtil,
];

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
  // The native "Image tools" bubble (Replace media / Crop image / Download
  // original / Alternative text) otherwise double-stacks with aether's
  // SelectedImageActions strip. aether owns this surface — see
  // docs/issues/2026-04-23-canvas-chrome-hierarchy.md.
  ImageToolbar: null,
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

const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

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

  return (
    <Tldraw
      className="absolute inset-0"
      inferDarkMode={false}
      licenseKey={TLDRAW_LICENSE_KEY}
      options={{ maxPages: 1 }}
      shapeUtils={AETHER_SHAPE_UTILS}
      onMount={(editor: Editor) => {
        editorRef.current = editor;
        setEditor(editor);
        if (typeof window !== 'undefined') {
          const globalShim = window as unknown as {
            editor?: Editor;
            tldraw?: {
              AssetRecordType: { createId: typeof AssetRecordType.createId };
              createShapeId: typeof createShapeId;
            };
          };
          globalShim.editor = editor;
          globalShim.tldraw = {
            AssetRecordType: { createId: () => AssetRecordType.createId() },
            createShapeId,
          };
        }
        editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
        // Seed the four hero artboards on an empty workspace so the multiformat
        // promise is visible on first paint. No-op if the page already has shapes.
        const initialFrames = editor.getCurrentPageShapes().filter((s) => s.type === 'frame');
        console.log('[aether/canvas] onMount · initial frames:', initialFrames.length);
        maybeSeedArtboards(editor);

        // Listener registers HERE inside onMount so we know the editor is
        // ready (a useEffect with [] would race onMount and register against
        // a null ref). Logs every commit + re-seeds if frames disappear.
        editor.store.listen(
          () => {
            const frames = editor.getCurrentPageShapes().filter((s) => s.type === 'frame');
            console.log('[aether/canvas] commit · frame count:', frames.length);
            if (frames.length === 0) {
              console.log('[aether/canvas] re-seeding artboards');
              maybeSeedArtboards(editor);
            }
          },
          { scope: 'document' } // catch BOTH user and remote sources (sync wipes count too)
        );

        // Also a one-shot 1s post-mount check to catch any async snapshot
        // replay that lands after the initial seed has already run.
        window.setTimeout(() => {
          const f = editor.getCurrentPageShapes().filter((s) => s.type === 'frame');
          console.log('[aether/canvas] +1s check · frame count:', f.length);
          if (f.length === 0) {
            console.log('[aether/canvas] re-seeding (delayed)');
            maybeSeedArtboards(editor);
          }
        }, 1000);
      }}
      components={components}
    />
  );
}
