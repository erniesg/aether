'use client';

import { memo, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { DefaultColorStyle, DefaultFillStyle } from 'tldraw';
import { cn } from '@/lib/utils/cn';
import { FloatingToolbar } from './FloatingToolbar';
import type {
  PrimitiveTool,
  Scope,
  ToolbarStyleAction,
  ToolbarVerb,
} from './FloatingToolbar';
import type { ComposerHandle } from '@/components/composer/PromptComposer';
import { useEditorRef } from '@/lib/store/editor-ref';

/**
 * Dynamically imported tldraw to keep the workspace route's initial bundle
 * small. The Tldraw component ships its own stylesheet — we import it at the
 * module level of the dynamic chunk.
 *
 * The dynamic() call is module-level so it is only evaluated once per module
 * load. The component itself is React.memo'd so re-renders from the
 * workspace shell (runs store changes, theme toggles elsewhere) don't cascade
 * into a canvas remount.
 */
const TldrawCanvas = dynamic(() => import('./TldrawCanvas').then((m) => m.TldrawCanvas), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="font-caption text-ink-faint">canvas · loading tldraw…</span>
    </div>
  ),
});

const EMPTY_PINS: ReadonlyArray<{ id: string; label: string }> = [];

export interface CanvasSubstrateProps {
  className?: string;
  composerRef: React.RefObject<ComposerHandle | null>;
  safeZonesVisible?: boolean;
  onSafeZonesToggle?: (next: boolean) => void;
  pinnedCapabilities?: ReadonlyArray<{ id: string; label: string }>;
  onCapabilityPress?: (id: string) => void;
  onVerbPress?: (verb: ToolbarVerb) => void;
}

export const CanvasSubstrate = memo(function CanvasSubstrate({
  className,
  composerRef,
  safeZonesVisible = false,
  onSafeZonesToggle,
  pinnedCapabilities = EMPTY_PINS,
  onCapabilityPress,
  onVerbPress,
}: CanvasSubstrateProps) {
  const [scope, setScope] = useState<Scope>('global');
  const { editor } = useEditorRef();

  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, [composerRef]);

  const handlePrimitiveToolPress = useCallback(
    (tool: PrimitiveTool) => {
      editor?.setCurrentTool(tool);
    },
    [editor]
  );

  const handleStyleAction = useCallback(
    (action: ToolbarStyleAction) => {
      if (!editor) return;
      switch (action) {
        case 'color-black':
          editor.setStyleForSelectedShapes(DefaultColorStyle, 'black');
          editor.setStyleForNextShapes(DefaultColorStyle, 'black');
          return;
        case 'color-blue':
          editor.setStyleForSelectedShapes(DefaultColorStyle, 'blue');
          editor.setStyleForNextShapes(DefaultColorStyle, 'blue');
          return;
        case 'fill-solid':
          editor.setStyleForSelectedShapes(DefaultFillStyle, 'solid');
          editor.setStyleForNextShapes(DefaultFillStyle, 'solid');
          return;
        case 'fill-none':
          editor.setStyleForSelectedShapes(DefaultFillStyle, 'none');
          editor.setStyleForNextShapes(DefaultFillStyle, 'none');
      }
    },
    [editor]
  );

  return (
    <section
      data-taxonomy="tool"
      aria-label="canvas"
      className={cn('relative flex-1 overflow-hidden bg-surface-canvas', className)}
    >
      <TldrawCanvas safeZonesVisible={safeZonesVisible} />

      <FloatingToolbar
        scope={scope}
        onScopeChange={setScope}
        safeZonesVisible={safeZonesVisible}
        onSafeZonesToggle={onSafeZonesToggle}
        onPrimitiveToolPress={handlePrimitiveToolPress}
        onStyleAction={handleStyleAction}
        onAIPress={focusComposer}
        onVerbPress={onVerbPress}
        pinnedCapabilities={[...pinnedCapabilities]}
        onCapabilityPress={onCapabilityPress}
      />
    </section>
  );
});
