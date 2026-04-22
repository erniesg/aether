'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AssetRecordType,
  DefaultColorStyle,
  DefaultFillStyle,
  type IndexKey,
  getIndexBelow,
  getIndexBetween,
} from 'tldraw';
import { cn } from '@/lib/utils/cn';
import { FloatingToolbar } from './FloatingToolbar';
import { SegmentationPanel, type SegmentationPreviewPayload } from './SegmentationPanel';
import { SegmentationPreviewOverlay } from './SegmentationPreviewOverlay';
import type {
  PrimitiveTool,
  Scope,
  ToolbarStyleAction,
  ToolbarVerb,
} from './FloatingToolbar';
import type { ComposerHandle } from '@/components/composer/PromptComposer';
import { buildBackgroundFillDataUrl, type BackgroundFillSpec } from '@/lib/canvas/backgroundFill';
import { getSelectedImageInfo, type SelectedImageInfo } from '@/lib/canvas/selectedImage';
import type {
  SegmentationProviderId,
  SegmentationProviderStatus,
} from '@/lib/providers/segmentation/types';
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

type SegmentationVerb = Extract<ToolbarVerb, 'cutout' | 'removebg' | 'unmask'>;

interface SegmentationDraft {
  verb: SegmentationVerb;
  providerId: SegmentationProviderId;
  prompt: string;
  loading: boolean;
  approved: boolean;
  error?: string;
  preview?: SegmentationPreviewPayload;
  targetShapeId: string;
}

const SEGMENTATION_PROVIDER_NAMES: Record<SegmentationProviderId, string> = {
  sam3: 'SAM 3',
  sam2: 'SAM 2',
};

const DEFAULT_SEGMENTATION_PROVIDERS: SegmentationProviderStatus[] = [
  {
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    models: ['sam3.1', 'sam3'],
    supportsTextPrompt: true,
    available: false,
    unavailableReason: 'checking availability',
  },
  {
    id: 'sam2',
    displayName: 'SAM 2 via Replicate',
    models: ['meta/sam-2'],
    supportsTextPrompt: false,
    available: false,
    unavailableReason: 'checking availability',
  },
];

const NO_SEGMENTATION_PROVIDER_ERROR =
  "Segmentation isn't connected here yet. Add SAM 3 or Replicate SAM 2 to preview cutouts.";
const SEGMENTATION_PROVIDER_CHECK_ERROR =
  "Couldn't check cutout providers. Try again in a moment.";

const DEFAULT_BACKGROUND_FILL: BackgroundFillSpec = {
  mode: 'solid',
  colorA: '#f4efe6',
  colorB: '#0f172a',
  opacity: 0.85,
  angle: 135,
};

function defaultPromptForVerb(verb: SegmentationVerb): string {
  switch (verb) {
    case 'removebg':
      return 'main subject';
    case 'unmask':
      return 'background';
    default:
      return '';
  }
}

function pickAvailableSegmentationProvider(
  providers: ReadonlyArray<SegmentationProviderStatus>,
  preferredId: SegmentationProviderId = 'sam3'
): SegmentationProviderId | null {
  const preferred = providers.find(
    (provider) => provider.id === preferredId && provider.available
  );
  if (preferred) return preferred.id;
  return providers.find((provider) => provider.available)?.id ?? null;
}

function formatSegmentationProviderError(
  providers: ReadonlyArray<SegmentationProviderStatus>,
  preferredId?: SegmentationProviderId
) {
  const fallback = pickAvailableSegmentationProvider(providers, preferredId);
  if (!fallback) return NO_SEGMENTATION_PROVIDER_ERROR;
  if (!preferredId || preferredId === fallback) return '';
  return `${SEGMENTATION_PROVIDER_NAMES[preferredId]} isn't available here yet. Switch to ${SEGMENTATION_PROVIDER_NAMES[fallback]} to preview the cutout.`;
}

function findBackgroundShapeId(editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>, imageShapeId: string) {
  const shape = editor
    .getCurrentPageShapes()
    .find(
      (candidate) =>
        candidate.type === 'image' &&
        (candidate.meta as Record<string, unknown> | undefined)?.aetherRole === 'background-fill' &&
        (candidate.meta as Record<string, unknown> | undefined)?.aetherForShapeId === imageShapeId
    );
  return shape?.id ?? null;
}

function getBackgroundIndex(
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>,
  shape: SelectedImageInfo
) {
  const siblingIds = editor.getSortedChildIdsForParent(shape.parentId as never);
  const index = siblingIds.indexOf(shape.shapeId as never);
  if (index <= 0) return getIndexBelow(shape.index as IndexKey);
  const previous = editor.getShape(siblingIds[index - 1] as never);
  return previous
    ? getIndexBetween(previous.index, shape.index as IndexKey)
    : getIndexBelow(shape.index as IndexKey);
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
  const [selectedImage, setSelectedImage] = useState<SelectedImageInfo | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationDraft | null>(null);
  const [backgroundFill, setBackgroundFill] =
    useState<BackgroundFillSpec>(DEFAULT_BACKGROUND_FILL);
  const [segmentationProviders, setSegmentationProviders] = useState<
    SegmentationProviderStatus[]
  >(DEFAULT_SEGMENTATION_PROVIDERS);
  const [segmentationProvidersLoading, setSegmentationProvidersLoading] =
    useState(false);
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

  useEffect(() => {
    if (!editor) {
      setSelectedImage(null);
      setSegmentation(null);
      return;
    }

    const sync = () => {
      const next = getSelectedImageInfo(editor);
      setSelectedImage(next);
      setSegmentation((current) => {
        if (!current) return current;
        if (!next || current.targetShapeId !== next.shapeId) return null;
        return current;
      });
    };

    sync();
    return editor.store.listen(sync);
  }, [editor]);

  const openSegmentation = useCallback(
    (verb: SegmentationVerb) => {
      if (!selectedImage) {
        onVerbPress?.(verb);
        return;
      }

      const providerId =
        pickAvailableSegmentationProvider(segmentationProviders, 'sam3') ?? 'sam3';

      setSegmentation({
        verb,
        providerId,
        prompt: defaultPromptForVerb(verb),
        loading: false,
        approved: false,
        error: pickAvailableSegmentationProvider(segmentationProviders, providerId)
          ? undefined
          : NO_SEGMENTATION_PROVIDER_ERROR,
        targetShapeId: selectedImage.shapeId,
      });
    },
    [onVerbPress, segmentationProviders, selectedImage]
  );

  const handleVerb = useCallback(
    (verb: ToolbarVerb) => {
      if (verb === 'cutout' || verb === 'removebg' || verb === 'unmask') {
        openSegmentation(verb);
        return;
      }
      onVerbPress?.(verb);
    },
    [onVerbPress, openSegmentation]
  );

  const handlePreviewSegmentation = useCallback(async () => {
    if (!segmentation || !selectedImage) return;

    const activeProvider = segmentationProviders.find(
      (provider) => provider.id === segmentation.providerId
    );

    if (segmentationProvidersLoading) return;

    if (!activeProvider?.available) {
      setSegmentation((current) =>
        current
          ? {
              ...current,
              error: formatSegmentationProviderError(
                segmentationProviders,
                current.providerId
              ),
            }
          : current
      );
      return;
    }

    setSegmentation((current) =>
      current ? { ...current, loading: true, error: undefined, approved: false } : current
    );

    try {
      const response = await fetch('/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: segmentation.providerId,
          sourceUrl: selectedImage.sourceUrl,
          mode: segmentation.verb,
          prompt: segmentation.prompt || undefined,
          width: selectedImage.intrinsicWidth,
          height: selectedImage.intrinsicHeight,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        provider?: { id: SegmentationProviderId; model: string };
        providers?: SegmentationProviderStatus[];
        preview?: SegmentationPreviewPayload;
      };

      if (!response.ok || !json.ok || !json.preview) {
        if (json.providers) {
          setSegmentationProviders(json.providers);
        }

        const providerError =
          json.code === 'provider_unavailable' && json.providers
            ? formatSegmentationProviderError(json.providers, segmentation.providerId)
            : undefined;

        throw new Error(providerError || json.error || response.statusText);
      }

      setSegmentation((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: undefined,
              approved: false,
              providerId: json.provider?.id ?? current.providerId,
              preview: json.preview,
            }
          : current
      );
    } catch (error) {
      setSegmentation((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : current
      );
    }
  }, [
    segmentation,
    segmentationProviders,
    segmentationProvidersLoading,
    selectedImage,
  ]);

  useEffect(() => {
    if (!segmentation) return;

    const controller = new AbortController();
    let cancelled = false;

    setSegmentationProvidersLoading(true);

    fetch('/api/segment', { signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as {
          ok?: boolean;
          error?: string;
          providers?: SegmentationProviderStatus[];
        };

        if (!response.ok || !json.ok || !json.providers) {
          throw new Error(json.error ?? response.statusText);
        }

        if (cancelled) return;

        const providers = json.providers;
        setSegmentationProviders(providers);
        setSegmentation((current) => {
          if (!current) return current;
          const nextProviderId =
            pickAvailableSegmentationProvider(providers, current.providerId) ??
            current.providerId;
          const providerError = formatSegmentationProviderError(providers, current.providerId);
          return {
            ...current,
            providerId: nextProviderId,
            error: providerError || current.error,
          };
        });
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        setSegmentationProviders(DEFAULT_SEGMENTATION_PROVIDERS);
        setSegmentation((current) =>
          current
            ? {
                ...current,
                error:
                  error instanceof Error && error.name === 'AbortError'
                    ? current.error
                    : SEGMENTATION_PROVIDER_CHECK_ERROR,
              }
            : current
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSegmentationProvidersLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [segmentation?.targetShapeId]);

  const handleApproveSegmentation = useCallback(() => {
    if (!editor || !selectedImage || !segmentation?.preview) return;

    const shape = editor.getShape(selectedImage.shapeId as never) as
      | { type: 'image'; meta?: Record<string, unknown> }
      | undefined;
    if (!shape || shape.type !== 'image') return;

    const assetId = AssetRecordType.createId();
    editor.markHistoryStoppingPoint('segment image');
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `${segmentation.verb} result`,
          src: segmentation.preview.cutoutDataUrl,
          w: segmentation.preview.width,
          h: segmentation.preview.height,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
        meta: {
          aetherRole: 'segmentation-result',
          aetherProviderId: segmentation.providerId,
        },
      },
    ]);
    editor.updateShape({
      id: selectedImage.shapeId as never,
      type: 'image',
      props: {
        assetId,
      },
      meta: {
        ...(shape.meta ?? {}),
        aetherOriginalSrc: selectedImage.sourceUrl,
        aetherCutout: true,
        aetherSegmentationVerb: segmentation.verb,
        aetherSegmentationProvider: segmentation.providerId,
        aetherSegmentationPrompt: segmentation.prompt,
      },
    } as never);

    setSegmentation((current) =>
      current ? { ...current, approved: true, error: undefined } : current
    );
  }, [editor, segmentation, selectedImage]);

  const handleApplyBackground = useCallback(() => {
    if (!editor || !selectedImage) return;

    const backgroundDataUrl = buildBackgroundFillDataUrl({
      width: selectedImage.intrinsicWidth,
      height: selectedImage.intrinsicHeight,
      fill: backgroundFill,
    });

    const assetId = AssetRecordType.createId();
    editor.markHistoryStoppingPoint('apply background fill');
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'background fill',
          src: backgroundDataUrl,
          w: selectedImage.intrinsicWidth,
          h: selectedImage.intrinsicHeight,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
        meta: {
          aetherRole: 'background-fill-asset',
        },
      },
    ]);

    const existingBackgroundId = findBackgroundShapeId(editor, selectedImage.shapeId);
    if (existingBackgroundId) {
      editor.updateShape({
        id: existingBackgroundId as never,
        type: 'image',
        x: selectedImage.x,
        y: selectedImage.y,
        props: {
          assetId,
          w: selectedImage.width,
          h: selectedImage.height,
        },
      } as never);
      editor.select(selectedImage.shapeId as never);
      return;
    }

    editor.createShape({
      id: undefined,
      type: 'image',
      parentId: selectedImage.parentId as never,
      x: selectedImage.x,
      y: selectedImage.y,
      index: getBackgroundIndex(editor, selectedImage),
      props: {
        assetId,
        w: selectedImage.width,
        h: selectedImage.height,
      },
      meta: {
        aetherRole: 'background-fill',
        aetherForShapeId: selectedImage.shapeId,
      },
    } as never);
    editor.select(selectedImage.shapeId as never);
  }, [backgroundFill, editor, selectedImage]);

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
        onVerbPress={handleVerb}
        pinnedCapabilities={[...pinnedCapabilities]}
        onCapabilityPress={onCapabilityPress}
      />

      {segmentation?.preview && !segmentation.approved && selectedImage ? (
        <SegmentationPreviewOverlay
          preview={segmentation.preview}
          rect={selectedImage.screenBounds}
        />
      ) : null}

      <SegmentationPanel
        open={segmentation !== null}
        verb={segmentation?.verb ?? 'removebg'}
        providerId={segmentation?.providerId ?? 'sam3'}
        providers={segmentationProviders}
        providerStatusLoading={segmentationProvidersLoading}
        prompt={segmentation?.prompt ?? ''}
        loading={segmentation?.loading}
        approved={segmentation?.approved}
        error={segmentation?.error}
        preview={segmentation?.preview}
        backgroundFill={backgroundFill}
        onPromptChange={(value) =>
          setSegmentation((current) => (current ? { ...current, prompt: value } : current))
        }
        onProviderChange={(value) =>
          setSegmentation((current) => (current ? { ...current, providerId: value } : current))
        }
        onPreview={handlePreviewSegmentation}
        onApprove={handleApproveSegmentation}
        onReject={() =>
          setSegmentation((current) =>
            current ? { ...current, approved: false, preview: undefined, error: undefined } : current
          )
        }
        onClose={() => setSegmentation(null)}
        onBackgroundModeChange={(mode) =>
          setBackgroundFill((current) => ({ ...current, mode }))
        }
        onBackgroundColorAChange={(colorA) =>
          setBackgroundFill((current) => ({ ...current, colorA }))
        }
        onBackgroundColorBChange={(colorB) =>
          setBackgroundFill((current) => ({ ...current, colorB }))
        }
        onBackgroundOpacityChange={(opacity) =>
          setBackgroundFill((current) => ({ ...current, opacity }))
        }
        onApplyBackground={handleApplyBackground}
        onUndo={() => editor?.undo()}
        onRedo={() => editor?.redo()}
      />
    </section>
  );
});
