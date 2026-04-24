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
import { SegmentationRefinementOverlay } from './SegmentationRefinementOverlay';
import { SelectedImageActions } from './SelectedImageActions';
import type {
  PrimitiveTool,
  Scope,
  ToolbarStyleAction,
  ToolbarVerb,
} from './FloatingToolbar';
import type { ComposerHandle } from '@/components/composer/PromptComposer';
import { buildBackgroundFillDataUrl, type BackgroundFillSpec } from '@/lib/canvas/backgroundFill';
import { getImageInfo, getSelectedImageInfo, type SelectedImageInfo } from '@/lib/canvas/selectedImage';
import { pickAspectRatio } from '@/lib/canvas/fanOut';
import type {
  SegmentationBoxPrompt,
  SegmentationProviderId,
  SegmentationProviderStatus,
  SegmentationPointPrompt,
  SegmentationRefinementMode,
} from '@/lib/providers/segmentation/types';
import { useEditorRef } from '@/lib/store/editor-ref';
import { failRun, finishRun, startRun, stepRun } from '@/lib/store/runs';
import { appendRunActivity, initRunDetails, upsertRunFrame } from '@/lib/store/runDetails';
import { readSegmentStream } from '@/lib/segment/stream';

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
  target: SelectedImageInfo;
  refinementMode: SegmentationRefinementMode | null;
  points: SegmentationPointPrompt[];
  box?: SegmentationBoxPrompt;
  loading: boolean;
  approved: boolean;
  previewVisible: boolean;
  runId?: string;
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
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
    available: false,
    unavailableReason: 'checking availability',
  },
  {
    id: 'sam2',
    displayName: 'SAM 2 via Replicate',
    models: ['meta/sam-2'],
    supportsTextPrompt: false,
    supportsPointPrompt: false,
    supportsBoxPrompt: false,
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

function labelForSegmentationVerb(verb: SegmentationVerb): string {
  switch (verb) {
    case 'removebg':
      return 'remove background';
    case 'unmask':
      return 'unmask';
    default:
      return 'segment';
  }
}

function summarizeSegmentationRun(verb: SegmentationVerb, prompt: string) {
  if (verb === 'removebg') return 'remove background';
  if (verb === 'unmask') return prompt ? `unmask · ${prompt}` : 'unmask';
  return prompt ? `segment · ${prompt}` : 'segment';
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

function resolveSegmentationFrame(
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>,
  target: SelectedImageInfo
) {
  const parent = editor.getShape(target.parentId as never) as
    | { id: string; type: string; props?: { w?: number; h?: number; name?: string } }
    | undefined;
  if (!parent || parent.type !== 'frame' || !parent.props?.w || !parent.props?.h) return null;
  return {
    id: parent.id,
    label: parent.props.name,
    aspectRatio: pickAspectRatio(parent.props.w, parent.props.h),
  };
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
        const target = getImageInfo(editor, current.targetShapeId);
        if (!target) return null;
        return {
          ...current,
          target,
        };
      });
    };

    sync();
    return editor.store.listen(sync);
  }, [editor]);

  const openSegmentation = useCallback(
    (verb: SegmentationVerb) => {
      const target = selectedImage ?? segmentation?.target;
      if (!target) {
        onVerbPress?.(verb);
        return;
      }

      const providerId =
        pickAvailableSegmentationProvider(segmentationProviders, 'sam3') ?? 'sam3';

      setSegmentation({
        verb,
        providerId,
        prompt: defaultPromptForVerb(verb),
        target,
        refinementMode: null,
        points: [],
        box: undefined,
        loading: false,
        approved: false,
        previewVisible: false,
        error: pickAvailableSegmentationProvider(segmentationProviders, providerId)
          ? undefined
          : NO_SEGMENTATION_PROVIDER_ERROR,
        targetShapeId: target.shapeId,
      });
    },
    [onVerbPress, segmentation?.target, segmentationProviders, selectedImage]
  );

  const handlePreviewVisibilityChange = useCallback((visible: boolean) => {
    setSegmentation((current) =>
      current
        ? {
            ...current,
            previewVisible: visible,
          }
        : current
    );
  }, []);

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

  const beginSegmentationRun = useCallback(
    (
      draft: SegmentationDraft,
      provider: SegmentationProviderStatus,
      target: SelectedImageInfo
    ) => {
      const runId = startRun({
        tool: draft.verb === 'removebg' ? 'cutout' : 'image-edit',
        provider: draft.providerId,
        model: provider.models[0] ?? '',
        prompt: summarizeSegmentationRun(draft.verb, draft.prompt),
      });

      const frame = editor ? resolveSegmentationFrame(editor, target) : null;
      initRunDetails(runId, {
        providerHint: draft.providerId,
        modelHint: provider.models[0],
        frames: frame
          ? [
              {
                id: frame.id,
                label: frame.label,
                aspectRatio: frame.aspectRatio,
                status: 'running',
                updatedAt: Date.now(),
              },
            ]
          : [],
      });
      appendRunActivity(runId, {
        title: 'selected image',
        detail: frame?.label ?? target.shapeId,
      });
      appendRunActivity(runId, {
        title: 'requesting preview',
        detail: `${labelForSegmentationVerb(draft.verb)} · ${draft.providerId}`,
      });
      stepRun(runId, 'awaiting');
      return { runId, frame };
    },
    [editor]
  );

  const handlePreviewSegmentation = useCallback(async () => {
    if (!segmentation) return;
    const targetImage = segmentation.target;

    const activeProvider = segmentationProviders.find(
      (provider) => provider.id === segmentation.providerId
    );

    if (segmentationProvidersLoading) return;

    if (!activeProvider || !activeProvider.available) {
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

    const { runId, frame } = beginSegmentationRun(segmentation, activeProvider, targetImage);
    setSegmentation((current) =>
      current
        ? {
            ...current,
            runId,
          }
        : current
    );

    try {
      const response = await fetch('/api/segment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          providerId: segmentation.providerId,
          sourceUrl: targetImage.sourceUrl,
          mode: segmentation.verb,
          prompt: segmentation.prompt || undefined,
          points: segmentation.points.length > 0 ? segmentation.points : undefined,
          box: segmentation.box,
          width: targetImage.intrinsicWidth,
          height: targetImage.intrinsicHeight,
          runId,
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (!contentType.includes('text/event-stream')) {
        const json = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
          providers?: SegmentationProviderStatus[];
        } | null;

        if (json?.providers) {
          setSegmentationProviders(json.providers);
        }

        const providerError =
          json?.code === 'provider_unavailable' && json.providers
            ? formatSegmentationProviderError(json.providers, segmentation.providerId)
            : undefined;
        const message = providerError || json?.error || response.statusText;
        appendRunActivity(runId, {
          title: 'preview failed',
          detail: message,
          tone: 'error',
        });
        if (frame) {
          upsertRunFrame(runId, {
            id: frame.id,
            label: frame.label,
            aspectRatio: frame.aspectRatio,
            status: 'error',
            error: message,
          });
        }
        failRun(runId, message, response.status);
        throw new Error(message);
      }

      let completed = false;
      let failureMessage: string | undefined;

      await readSegmentStream(response, async (event) => {
        switch (event.type) {
          case 'segment.started': {
            stepRun(runId, 'sending');
            appendRunActivity(runId, {
              title: 'segmentation running',
              detail: `${event.provider.id} · ${event.mode}`,
            });
            return;
          }
          case 'segment.progress': {
            const nextStep =
              event.phase === 'postprocess' ? 'parsing' : 'awaiting';
            stepRun(runId, nextStep);
            appendRunActivity(runId, {
              title: event.phase,
              detail:
                event.phase === 'inference'
                  ? 'provider inference'
                  : event.phase === 'postprocess'
                  ? 'composing cutout'
                  : 'uploading source',
            });
            return;
          }
          case 'segment.completed': {
            completed = true;
            const preview: SegmentationPreviewPayload = event.preview;
            appendRunActivity(runId, {
              title: 'preview ready',
              detail: 'toggle preview or approve to apply',
              tone: 'ok',
            });
            if (frame) {
              upsertRunFrame(runId, {
                id: frame.id,
                label: frame.label,
                aspectRatio: frame.aspectRatio,
                status: 'returned',
                imageUrl: preview.cutoutDataUrl,
              });
            }
            finishRun(runId, {
              provider: event.provider.id,
              model: event.provider.model || activeProvider.models[0] || '',
              imageUrl: preview.cutoutDataUrl,
              latencyMs: event.latencyMs,
              status: 'ok',
            });
            setSegmentation((current) =>
              current
                ? {
                    ...current,
                    loading: false,
                    error: undefined,
                    approved: false,
                    previewVisible: true,
                    providerId: event.provider.id,
                    preview,
                  }
                : current
            );
            return;
          }
          case 'segment.failed': {
            if (event.providers) {
              setSegmentationProviders(event.providers);
            }
            const providerError =
              event.code === 'provider_unavailable' && event.providers
                ? formatSegmentationProviderError(event.providers, segmentation.providerId)
                : undefined;
            const message = providerError || event.error;
            failureMessage = message;
            const httpStatus =
              event.code === 'provider_unavailable'
                ? 503
                : event.code === 'segmentation_failed'
                ? 502
                : response.status || 500;
            appendRunActivity(runId, {
              title: 'preview failed',
              detail: message,
              tone: 'error',
            });
            if (frame) {
              upsertRunFrame(runId, {
                id: frame.id,
                label: frame.label,
                aspectRatio: frame.aspectRatio,
                status: 'error',
                error: message,
              });
            }
            failRun(runId, message, httpStatus);
            return;
          }
        }
      });

      if (!completed) {
        throw new Error(failureMessage ?? 'segmentation stream closed without completion');
      }
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
    beginSegmentationRun,
    segmentation,
    segmentationProviders,
    segmentationProvidersLoading,
  ]);

  useEffect(() => {
    if (!segmentation) return;
    if (segmentation.verb !== 'removebg') return;
    if (segmentation.runId !== undefined) return;
    if (segmentation.loading) return;
    if (segmentation.preview) return;
    if (segmentationProvidersLoading) return;

    const activeProvider = segmentationProviders.find(
      (provider) => provider.id === segmentation.providerId
    );
    if (!activeProvider?.available) return;

    void handlePreviewSegmentation();
  }, [
    segmentation?.verb,
    segmentation?.runId,
    segmentation?.loading,
    segmentation?.preview,
    segmentation?.providerId,
    segmentation?.targetShapeId,
    segmentationProvidersLoading,
    segmentationProviders,
    handlePreviewSegmentation,
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

  const handleSegmentationRefinementModeChange = useCallback(
    (mode: SegmentationRefinementMode | null) => {
      setSegmentation((current) =>
        current
          ? {
              ...current,
              refinementMode: mode,
            }
          : current
      );
    },
    []
  );

  const handleSegmentationPointAdd = useCallback((point: SegmentationPointPrompt) => {
    setSegmentation((current) =>
      current
        ? {
            ...current,
            approved: false,
            error: undefined,
            preview: undefined,
            previewVisible: false,
            points: [...current.points, point],
          }
        : current
    );
  }, []);

  const handleSegmentationBoxChange = useCallback((box?: SegmentationBoxPrompt) => {
    setSegmentation((current) =>
      current
        ? {
            ...current,
            approved: false,
            error: undefined,
            preview: undefined,
            previewVisible: false,
            box,
          }
        : current
    );
  }, []);

  const handleSegmentationRefinementClear = useCallback(() => {
    setSegmentation((current) =>
      current
        ? {
            ...current,
            approved: false,
            box: undefined,
            error: undefined,
            points: [],
            preview: undefined,
            previewVisible: false,
            refinementMode: null,
          }
        : current
    );
  }, []);

  const handleApproveSegmentation = useCallback(() => {
    if (!editor || !segmentation?.preview) return;
    const targetImage = segmentation.target;

    const shape = editor.getShape(targetImage.shapeId as never) as
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
      id: targetImage.shapeId as never,
      type: 'image',
      props: {
        assetId,
      },
      meta: {
        ...(shape.meta ?? {}),
        aetherOriginalSrc: targetImage.sourceUrl,
        aetherCutout: true,
        aetherSegmentationVerb: segmentation.verb,
        aetherSegmentationProvider: segmentation.providerId,
        aetherSegmentationPrompt: segmentation.prompt,
      },
    } as never);

    if (segmentation.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'applied to canvas',
        detail: labelForSegmentationVerb(segmentation.verb),
        tone: 'ok',
      });
      const frame = resolveSegmentationFrame(editor, targetImage);
      if (frame) {
        upsertRunFrame(segmentation.runId, {
          id: frame.id,
          label: frame.label,
          aspectRatio: frame.aspectRatio,
          status: 'placed',
          imageUrl: segmentation.preview.cutoutDataUrl,
        });
      }
      finishRun(segmentation.runId, {
        imageUrl: segmentation.preview.cutoutDataUrl,
        status: 'ok',
      });
    }

    setSegmentation((current) =>
      current ? { ...current, approved: true, error: undefined } : current
    );
  }, [editor, segmentation]);

  const handleApplyBackground = useCallback(() => {
    if (!editor || !segmentation) return;
    const targetImage = segmentation.target;

    const backgroundDataUrl = buildBackgroundFillDataUrl({
      width: targetImage.intrinsicWidth,
      height: targetImage.intrinsicHeight,
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
          w: targetImage.intrinsicWidth,
          h: targetImage.intrinsicHeight,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
        meta: {
          aetherRole: 'background-fill-asset',
        },
      },
    ]);

    const existingBackgroundId = findBackgroundShapeId(editor, targetImage.shapeId);
    if (existingBackgroundId) {
      editor.updateShape({
        id: existingBackgroundId as never,
        type: 'image',
        x: targetImage.x,
        y: targetImage.y,
        props: {
          assetId,
          w: targetImage.width,
          h: targetImage.height,
        },
      } as never);
      editor.select(targetImage.shapeId as never);
      if (segmentation.runId) {
        appendRunActivity(segmentation.runId, {
          title: 'background applied',
          detail: `${backgroundFill.mode} · ${Math.round(backgroundFill.opacity * 100)}%`,
          tone: 'ok',
        });
      }
      return;
    }

    editor.createShape({
      id: undefined,
      type: 'image',
      parentId: targetImage.parentId as never,
      x: targetImage.x,
      y: targetImage.y,
      index: getBackgroundIndex(editor, targetImage),
      props: {
        assetId,
        w: targetImage.width,
        h: targetImage.height,
      },
      meta: {
        aetherRole: 'background-fill',
        aetherForShapeId: targetImage.shapeId,
      },
    } as never);
    editor.select(targetImage.shapeId as never);
    if (segmentation.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'background applied',
        detail: `${backgroundFill.mode} · ${Math.round(backgroundFill.opacity * 100)}%`,
        tone: 'ok',
      });
    }
  }, [backgroundFill, editor, segmentation]);

  const handleRejectSegmentation = useCallback(() => {
    if (segmentation?.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'preview dismissed',
        detail: 'kept original image',
      });
    }
    setSegmentation((current) =>
      current
        ? {
            ...current,
            approved: false,
            preview: undefined,
            previewVisible: false,
            error: undefined,
          }
        : current
    );
  }, [segmentation?.runId]);

  const imageActionsTarget = selectedImage ?? segmentation?.target ?? null;

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

      {imageActionsTarget ? (
        <SelectedImageActions
          rect={imageActionsTarget.screenBounds}
          hasPreview={Boolean(segmentation?.preview)}
          previewVisible={segmentation?.previewVisible ?? false}
          disabled={segmentation?.loading}
          onRemoveBg={() => openSegmentation('removebg')}
          onCutout={() => openSegmentation('cutout')}
          onPreviewVisibilityChange={handlePreviewVisibilityChange}
        />
      ) : null}

      {segmentation?.preview &&
      segmentation.previewVisible &&
      !segmentation.approved ? (
        <SegmentationPreviewOverlay
          preview={segmentation.preview}
          rect={segmentation.target.screenBounds}
        />
      ) : null}

      {segmentation ? (
        <SegmentationRefinementOverlay
          rect={segmentation.target.screenBounds}
          imageSize={{
            width: segmentation.target.intrinsicWidth,
            height: segmentation.target.intrinsicHeight,
          }}
          mode={segmentation.refinementMode}
          points={segmentation.points}
          box={segmentation.box}
          onAddPoint={handleSegmentationPointAdd}
          onBoxChange={handleSegmentationBoxChange}
        />
      ) : null}

      <SegmentationPanel
        open={segmentation !== null}
        verb={segmentation?.verb ?? 'removebg'}
        providerId={segmentation?.providerId ?? 'sam3'}
        providers={segmentationProviders}
        providerStatusLoading={segmentationProvidersLoading}
        prompt={segmentation?.prompt ?? ''}
        pointCount={segmentation?.points.length ?? 0}
        hasBox={Boolean(segmentation?.box)}
        refinementMode={segmentation?.refinementMode ?? null}
        loading={segmentation?.loading}
        approved={segmentation?.approved}
        error={segmentation?.error}
        preview={segmentation?.preview}
        previewVisible={segmentation?.previewVisible}
        backgroundFill={backgroundFill}
        onPromptChange={(value) =>
          setSegmentation((current) =>
            current
              ? {
                  ...current,
                  prompt: value,
                  approved: false,
                  preview: undefined,
                  previewVisible: false,
                }
              : current
          )
        }
        onProviderChange={(value) =>
          setSegmentation((current) =>
            current
              ? {
                  ...current,
                  providerId: value,
                  refinementMode: null,
                  approved: false,
                  error: undefined,
                  preview: undefined,
                  previewVisible: false,
                }
              : current
          )
        }
        onRefinementModeChange={handleSegmentationRefinementModeChange}
        onClearRefinement={handleSegmentationRefinementClear}
        onPreview={handlePreviewSegmentation}
        onPreviewVisibilityChange={handlePreviewVisibilityChange}
        onApprove={handleApproveSegmentation}
        onReject={handleRejectSegmentation}
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
