'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AssetRecordType,
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
import { AirBrushOverlay } from './AirBrushOverlay';
import { MotionArtifactPreview, type MotionArtifact } from './MotionArtifactPreview';
import type {
  Scope,
  ToolbarStyleAction,
  ToolbarVerb,
} from './FloatingToolbar';
import type { ComposerHandle } from '@/components/composer/PromptComposer';
import { buildBackgroundFillDataUrl, type BackgroundFillSpec } from '@/lib/canvas/backgroundFill';
import { getImageInfo, getSelectedImageInfo, type SelectedImageInfo } from '@/lib/canvas/selectedImage';
import {
  adjustSketchBrushSize,
  DEFAULT_SKETCH_BRUSH_STATE,
  type PrimitiveTool,
  type SketchBrushColor,
  type SketchBrushSize,
  type SketchBrushState,
} from '@/lib/canvas/sketchBrush';
import {
  applyPrimitiveTool,
  applySketchBrushStyles,
} from '@/lib/canvas/sketchBrushEditor';
import {
  messageFromUnknownError,
  recordAirBrushDebugEvent,
  type AirBrushPoint,
} from '@/lib/canvas/airBrush';
import { pickAspectRatio } from '@/lib/canvas/fanOut';
import type {
  SegmentationBoxPrompt,
  SegmentationProviderId,
  SegmentationProviderStatus,
  SegmentationPointPrompt,
  SegmentationRefinementMode,
} from '@/lib/providers/segmentation/types';
import type { ImageElementSuggestion } from '@/lib/providers/vision/types';
import { inferDataUrlMimeType } from '@/lib/segment/dataUrl';
import { useEditorRef } from '@/lib/store/editor-ref';
import { failRun, finishRun, startRun, stepRun } from '@/lib/store/runs';
import { appendRunActivity, initRunDetails, upsertRunFrame } from '@/lib/store/runDetails';
import { focusFrameAtIndex, getFrameShapes, zoomToAllFrames } from '@/lib/canvas/focusFrame';
import { VoiceOrb, type VoiceCaptionEvent } from './VoiceOrb';
import type { VoiceDispatchers } from '@/lib/voice/tools';
import {
  setVoiceError,
  setVoiceState,
  setVoiceToolCall,
  setVoiceTranscript,
} from '@/lib/voice/caption-store';

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
  layoutGuardEnabled?: boolean;
  onLayoutGuardToggle?: (next: boolean) => void;
  onApplyGuardedLayout?: () => void;
  pinnedCapabilities?: ReadonlyArray<{ id: string; label: string }>;
  onCapabilityPress?: (id: string) => void;
  onVerbPress?: (verb: ToolbarVerb) => void;
  /**
   * Fires when the voice provider emits `run_generate`. The shell owns the
   * generate/fan-out pipeline, so we pass the request back up rather than
   * duplicating the stream logic here.
   */
  onVoiceGenerate?: (prompt: string, scope: 'single' | 'all') => void | Promise<void>;
  /**
   * Exposes the voice chip as a render prop so tests can inject a stub
   * VoiceProvider. When omitted, the default `VoiceOrb` is rendered with the
   * shared OpenAI Realtime client.
   */
  renderVoiceSlot?: (dispatchers: import('@/lib/voice/tools').VoiceDispatchers) => React.ReactNode;
  /** When true, show the voice orb inside the toolbar. Defaults to true. */
  voiceEnabled?: boolean;
  /** Latest deterministic motion artifact generated from the composer/voice flow. */
  motionArtifact?: MotionArtifact | null;
  onMotionArtifactDismiss?: () => void;
}

type SegmentationVerb = Extract<ToolbarVerb, 'cutout' | 'removebg' | 'unmask'>;
type FrameShapeWithBounds = {
  id: string;
  type: 'frame';
  props: { w?: number; h?: number; name?: string };
};

interface GeneratedPlatePreview {
  regionId: string | null;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

interface SegmentationDraft {
  verb: SegmentationVerb;
  providerId: SegmentationProviderId;
  prompt: string;
  target: SelectedImageInfo;
  refinementMode: SegmentationRefinementMode | null;
  points: SegmentationPointPrompt[];
  box?: SegmentationBoxPrompt;
  loading: boolean;
  plateLoading: boolean;
  elementsLoading: boolean;
  approved: boolean;
  previewVisible: boolean;
  activeRegionId: string | null;
  elementsSummary?: string;
  elements?: ImageElementSuggestion[];
  generatedPlate?: GeneratedPlatePreview;
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

function resolveClearableSketchShapeIds(
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>,
  sessionShapeIds: readonly string[]
) {
  const activeSessionShapeIds = sessionShapeIds.filter(
    (id) => editor.getShape(id as never)?.type === 'draw'
  );
  if (activeSessionShapeIds.length > 0) return activeSessionShapeIds;

  return editor
    .getSelectedShapeIds()
    .filter((id) => editor.getShape(id)?.type === 'draw');
}

function resolveAirBrushTargetFrame(
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>
): FrameShapeWithBounds | null {
  const selectedFrame = editor.getOnlySelectedShape();
  if (selectedFrame?.type === 'frame') return selectedFrame as FrameShapeWithBounds;
  return (getFrameShapes(editor)[0] as FrameShapeWithBounds | undefined) ?? null;
}

function resolveAirBrushClientPoint({
  editor,
  fallbackBounds,
  point,
}: {
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>;
  fallbackBounds: DOMRect;
  point: AirBrushPoint;
}) {
  const targetFrame = resolveAirBrushTargetFrame(editor);
  if (targetFrame) {
    const frameBounds = editor.getShapePageBounds(targetFrame.id as never);
    if (frameBounds && frameBounds.w > 0 && frameBounds.h > 0) {
      const topLeft = editor.pageToScreen({
        x: frameBounds.x,
        y: frameBounds.y,
      });
      const bottomRight = editor.pageToScreen({
        x: frameBounds.x + frameBounds.w,
        y: frameBounds.y + frameBounds.h,
      });
      const left = Math.min(topLeft.x, bottomRight.x);
      const top = Math.min(topLeft.y, bottomRight.y);
      const width = Math.abs(bottomRight.x - topLeft.x);
      const height = Math.abs(bottomRight.y - topLeft.y);
      if (width > 0 && height > 0) {
        return {
          point: {
            x: left + width * point.x,
            y: top + height * point.y,
            z: point.pressure ?? (point.state === 'end' ? 0 : 0.55),
          },
          frameId: targetFrame.id,
          frameLabel: targetFrame.props.name,
        };
      }
    }
  }

  return {
    point: {
      x: fallbackBounds.left + fallbackBounds.width * point.x,
      y: fallbackBounds.top + fallbackBounds.height * point.y,
      z: point.pressure ?? (point.state === 'end' ? 0 : 0.55),
    },
    frameId: null,
    frameLabel: null,
  };
}

function upsertBackgroundAsset(params: {
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>;
  targetImage: SelectedImageInfo;
  name: string;
  src: string;
  mimeType: string;
  sourceTag: 'fill' | 'plate';
}) {
  const { editor, targetImage } = params;
  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: params.name,
        src: params.src,
        w: targetImage.intrinsicWidth,
        h: targetImage.intrinsicHeight,
        mimeType: params.mimeType,
        isAnimated: false,
      },
      meta: {
        aetherRole:
          params.sourceTag === 'plate'
            ? 'background-plate-asset'
            : 'background-fill-asset',
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
      meta: {
        aetherRole: 'background-fill',
        aetherForShapeId: targetImage.shapeId,
        aetherBackgroundSource: params.sourceTag,
      },
    } as never);
    editor.select(targetImage.shapeId as never);
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
      aetherBackgroundSource: params.sourceTag,
    },
  } as never);
  editor.select(targetImage.shapeId as never);
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

function resolveActiveSegmentationPreview(
  draft: SegmentationDraft | null
): SegmentationPreviewPayload | undefined {
  if (!draft?.preview) return undefined;

  const activeRegion =
    draft.activeRegionId === null
      ? undefined
      : draft.preview.regions?.find((region) => region.id === draft.activeRegionId);

  const generatedPlateDataUrl =
    draft.generatedPlate &&
    draft.generatedPlate.regionId === draft.activeRegionId
      ? draft.generatedPlate.dataUrl
      : undefined;

  if (!activeRegion) {
    return {
      ...draft.preview,
      backgroundPlateDataUrl:
        generatedPlateDataUrl ?? draft.preview.backgroundPlateDataUrl,
    };
  }

  return {
    ...draft.preview,
    maskDataUrl: activeRegion.maskDataUrl,
    cutoutDataUrl: activeRegion.cutoutDataUrl,
    bbox: activeRegion.bbox,
    backgroundPlateDataUrl: generatedPlateDataUrl,
  };
}

export const CanvasSubstrate = memo(function CanvasSubstrate({
  className,
  composerRef,
  safeZonesVisible = false,
  onSafeZonesToggle,
  layoutGuardEnabled = true,
  onLayoutGuardToggle,
  onApplyGuardedLayout,
  pinnedCapabilities = EMPTY_PINS,
  onCapabilityPress,
  onVerbPress,
  onVoiceGenerate,
  renderVoiceSlot,
  voiceEnabled = true,
  motionArtifact,
  onMotionArtifactDismiss,
}: CanvasSubstrateProps) {
  const [scope, setScope] = useState<Scope>('global');
  const [airBrushActive, setAirBrushActive] = useState(false);
  const [sketchBrush, setSketchBrush] = useState<SketchBrushState>(
    DEFAULT_SKETCH_BRUSH_STATE
  );
  const [sketchSessionShapeIds, setSketchSessionShapeIds] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<SelectedImageInfo | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationDraft | null>(null);
  const [backgroundFill, setBackgroundFill] =
    useState<BackgroundFillSpec>(DEFAULT_BACKGROUND_FILL);
  const [segmentationProviders, setSegmentationProviders] = useState<
    SegmentationProviderStatus[]
  >(DEFAULT_SEGMENTATION_PROVIDERS);
  const [segmentationProvidersLoading, setSegmentationProvidersLoading] =
    useState(false);
  const trackedDrawShapeIds = useRef<Set<string>>(new Set());
  const canvasRootRef = useRef<HTMLElement | null>(null);
  const { editor } = useEditorRef();

  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, [composerRef]);

  const handlePrimitiveToolPress = useCallback(
    (tool: PrimitiveTool) => {
      setSketchBrush((current) => ({ ...current, tool }));
      if (!editor) return;
      applyPrimitiveTool(editor, tool);
    },
    [editor]
  );

  const sketchSessionShapeIdsRef = useRef<string[]>([]);
  useEffect(() => {
    sketchSessionShapeIdsRef.current = sketchSessionShapeIds;
  }, [sketchSessionShapeIds]);

  const captureSketchAsReference = useCallback(async () => {
    if (!editor) return;
    const ids = sketchSessionShapeIdsRef.current.filter(
      (id) => editor.getShape(id as never)?.type === 'draw'
    );
    if (ids.length === 0) return;
    try {
      const { url } = await editor.toImageDataUrl(ids as never, {
        background: true,
        padding: 48,
        scale: 1,
      });
      composerRef.current?.addReferenceDataUrl(url);
    } catch {
      // export failed (rare, e.g. headless canvas during teardown); swallow
    }
  }, [editor, composerRef]);

  const handleAirBrushToggle = useCallback(
    (active: boolean) => {
      setAirBrushActive(active);
      if (active) {
        if (editor && getFrameShapes(editor).length > 0) {
          focusFrameAtIndex(editor, 0);
        }
        handlePrimitiveToolPress('draw');
      } else {
        // Finished air-brushing; feed the sketch into the composer as a
        // reference chip. User can now type a prompt and the drawn shape is
        // automatically the generation context.
        void captureSketchAsReference();
      }
    },
    [editor, handlePrimitiveToolPress, captureSketchAsReference]
  );

  const handleAirBrushPoint = useCallback(
    (point: AirBrushPoint) => {
      if (point.state === 'hover') return;
      if (!editor) {
        recordAirBrushDebugEvent('dispatch-skipped', {
          reason: 'missing-editor',
          state: point.state,
          intent: point.intent ?? 'draw',
        });
        return;
      }
      const bounds = canvasRootRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        recordAirBrushDebugEvent('dispatch-skipped', {
          reason: 'missing-canvas-bounds',
          state: point.state,
          intent: point.intent ?? 'draw',
          bounds: bounds
            ? { width: bounds.width, height: bounds.height }
            : null,
        });
        return;
      }

      if (point.state === 'start') {
        if ((point.intent ?? 'draw') === 'erase') {
          editor.setCurrentTool('eraser');
        } else {
          handlePrimitiveToolPress('draw');
        }
      }

      const name =
        point.state === 'start'
          ? 'pointer_down'
          : point.state === 'end'
            ? 'pointer_up'
            : 'pointer_move';
      const target = resolveAirBrushClientPoint({
        editor,
        fallbackBounds: bounds,
        point,
      });

      try {
        editor.dispatch({
          type: 'pointer',
          target: 'canvas',
          name,
          point: target.point,
          pointerId: 74701,
          button: 0,
          isPen: false,
          shiftKey: false,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          accelKey: false,
        });
        const dispatchedPointCount =
          typeof window === 'undefined'
            ? 1
            : (window.__AETHER_AIR_BRUSH_DEBUG__?.dispatchedPointCount ?? 0) + 1;
        recordAirBrushDebugEvent(
          'dispatch',
          {
            name,
            state: point.state,
            intent: point.intent ?? 'draw',
            frameId: target.frameId,
            frameLabel: target.frameLabel,
            x: Number(point.x.toFixed(3)),
            y: Number(point.y.toFixed(3)),
          },
          { dispatchedPointCount },
          { log: name !== 'pointer_move' }
        );
      } catch (err) {
        recordAirBrushDebugEvent('dispatch-error', {
          error: messageFromUnknownError(err, 'air brush pointer dispatch failed'),
          name,
          state: point.state,
          intent: point.intent ?? 'draw',
        });
      }
    },
    [editor, handlePrimitiveToolPress]
  );

  const handleBrushColorChange = useCallback((color: SketchBrushColor) => {
    setSketchBrush((current) => ({ ...current, color }));
  }, []);

  const handleBrushSizeChange = useCallback((size: SketchBrushSize) => {
    setSketchBrush((current) => ({ ...current, size }));
  }, []);

  const handleBrushSizeAdjust = useCallback((delta: 'thicker' | 'thinner') => {
    setSketchBrush((current) => ({
      ...current,
      size: adjustSketchBrushSize(current.size, delta),
    }));
  }, []);

  const handleStyleAction = useCallback(
    (action: ToolbarStyleAction) => {
      switch (action) {
        case 'color-black':
          handleBrushColorChange('black');
          return;
        case 'color-white':
          handleBrushColorChange('white');
          return;
        case 'color-blue':
          handleBrushColorChange('blue');
          return;
        case 'color-brand-primary':
          handleBrushColorChange('brand-primary');
          return;
        case 'color-brand-accent':
          handleBrushColorChange('brand-accent');
          return;
        case 'size-small':
          handleBrushSizeChange('small');
          return;
        case 'size-medium':
          handleBrushSizeChange('medium');
          return;
        case 'size-large':
          handleBrushSizeChange('large');
          return;
        case 'fill-solid':
          if (!editor) return;
          editor.setStyleForSelectedShapes(DefaultFillStyle, 'solid');
          editor.setStyleForNextShapes(DefaultFillStyle, 'solid');
          return;
        case 'fill-none':
          if (!editor) return;
          editor.setStyleForSelectedShapes(DefaultFillStyle, 'none');
          editor.setStyleForNextShapes(DefaultFillStyle, 'none');
      }
    },
    [editor, handleBrushColorChange, handleBrushSizeChange]
  );

  useEffect(() => {
    if (!editor) return;
    applySketchBrushStyles(editor, sketchBrush);
  }, [editor, sketchBrush.color, sketchBrush.size]);

  useEffect(() => {
    if (!editor) {
      trackedDrawShapeIds.current = new Set();
      setSketchSessionShapeIds([]);
      setSelectedImage(null);
      setSegmentation(null);
      return;
    }

    const sync = () => {
      const currentDrawShapeIds = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === 'draw')
        .map((shape) => String(shape.id));
      const nextTrackedDrawShapeIds = new Set(currentDrawShapeIds);
      const newDrawShapeIds = currentDrawShapeIds.filter(
        (id) => !trackedDrawShapeIds.current.has(id)
      );
      trackedDrawShapeIds.current = nextTrackedDrawShapeIds;
      setSketchSessionShapeIds((current) => {
        const stillPresent = current.filter((id) => nextTrackedDrawShapeIds.has(id));
        if (newDrawShapeIds.length === 0 || sketchBrush.tool !== 'draw') return stillPresent;
        const known = new Set(stillPresent);
        return [
          ...stillPresent,
          ...newDrawShapeIds.filter((id) => !known.has(id)),
        ];
      });

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
  }, [editor, sketchBrush.tool]);

  const handleClearSketch = useCallback(() => {
    if (!editor) return;
    const shapeIds = resolveClearableSketchShapeIds(editor, sketchSessionShapeIds);
    if (shapeIds.length === 0) return;
    editor.deleteShapes(shapeIds as never);
    setSketchSessionShapeIds([]);
  }, [editor, sketchSessionShapeIds]);

  const handleConfirmSketch = useCallback(() => {
    if (!editor) return;
    const shapeIds = sketchSessionShapeIds.filter(
      (id) => editor.getShape(id as never)?.type === 'draw'
    );
    if (shapeIds.length > 0) {
      editor.setSelectedShapes(shapeIds as never);
    }
    setSketchSessionShapeIds([]);
    handlePrimitiveToolPress('select');
  }, [editor, handlePrimitiveToolPress, sketchSessionShapeIds]);

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
        plateLoading: false,
        elementsLoading: true,
        approved: false,
        previewVisible: false,
        activeRegionId: null,
        elementsSummary: undefined,
        elements: undefined,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: segmentation.providerId,
          sourceUrl: targetImage.sourceUrl,
          mode: segmentation.verb,
          prompt: segmentation.prompt || undefined,
          points: segmentation.points.length > 0 ? segmentation.points : undefined,
          box: segmentation.box,
          width: targetImage.intrinsicWidth,
          height: targetImage.intrinsicHeight,
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

        const message = providerError || json.error || response.statusText;
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

      appendRunActivity(runId, {
        title: 'preview ready',
        detail: 'toggle preview or approve to apply',
        tone: 'ok',
      });
      if (json.preview.regions?.length) {
        appendRunActivity(runId, {
          title: 'regions detected',
          detail: `${json.preview.regions.length} candidate ${json.preview.regions.length === 1 ? 'region' : 'regions'}`,
        });
      }
      if (json.preview.backgroundPlateDataUrl) {
        appendRunActivity(runId, {
          title: 'background plate',
          detail: 'provider returned a reusable clean plate',
        });
      }
      if (frame) {
        upsertRunFrame(runId, {
          id: frame.id,
          label: frame.label,
          aspectRatio: frame.aspectRatio,
          status: 'returned',
          imageUrl: json.preview.cutoutDataUrl,
        });
      }
      finishRun(runId, {
        provider: json.provider?.id ?? segmentation.providerId,
        model: json.provider?.model ?? activeProvider.models[0] ?? '',
        imageUrl: json.preview.cutoutDataUrl,
        status: 'ok',
      });

      setSegmentation((current) =>
        current
          ? {
              ...current,
              loading: false,
              plateLoading: false,
              error: undefined,
              approved: false,
              previewVisible: true,
              activeRegionId: null,
              generatedPlate: undefined,
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
    beginSegmentationRun,
    segmentation,
    segmentationProviders,
    segmentationProvidersLoading,
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

  useEffect(() => {
    if (!segmentation?.target.sourceUrl) return;

    const controller = new AbortController();
    let cancelled = false;
    const targetShapeId = segmentation.targetShapeId;

    setSegmentation((current) =>
      current && current.targetShapeId === targetShapeId
        ? {
            ...current,
            elementsLoading: true,
            elementsSummary: undefined,
            elements: undefined,
          }
        : current
    );

    fetch('/api/segment/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: segmentation.target.sourceUrl,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          ok?: boolean;
          inventory?: {
            summary?: string;
            elements?: ImageElementSuggestion[];
          };
        };

        if (!response.ok || !json.ok || !json.inventory) {
          throw new Error(response.statusText);
        }

        if (cancelled) return;

        setSegmentation((current) =>
          current && current.targetShapeId === targetShapeId
            ? {
                ...current,
                elementsLoading: false,
                elementsSummary: json.inventory?.summary,
                elements: Array.isArray(json.inventory?.elements)
                  ? json.inventory.elements
                  : [],
              }
            : current
        );
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setSegmentation((current) =>
          current && current.targetShapeId === targetShapeId
            ? {
                ...current,
                elementsLoading: false,
                elementsSummary: undefined,
                elements: [],
              }
            : current
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [segmentation?.targetShapeId, segmentation?.target.sourceUrl]);

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
              activeRegionId: null,
              generatedPlate: undefined,
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
              activeRegionId: null,
              generatedPlate: undefined,
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
              activeRegionId: null,
              generatedPlate: undefined,
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
    const activePreview = resolveActiveSegmentationPreview(segmentation);
    if (!activePreview) return;
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
          src: activePreview.cutoutDataUrl,
          w: activePreview.width,
          h: activePreview.height,
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
        aetherSegmentationRegionCount: segmentation.preview.regions?.length ?? 0,
        aetherSegmentationRegionId: segmentation.activeRegionId ?? 'all',
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
          imageUrl: activePreview.cutoutDataUrl,
        });
      }
      finishRun(segmentation.runId, {
        imageUrl: activePreview.cutoutDataUrl,
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

    editor.markHistoryStoppingPoint('apply background fill');
    upsertBackgroundAsset({
      editor,
      targetImage,
      name: 'background fill',
      src: backgroundDataUrl,
      mimeType: 'image/svg+xml',
      sourceTag: 'fill',
    });
    if (segmentation.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'background applied',
        detail: `${backgroundFill.mode} · ${Math.round(backgroundFill.opacity * 100)}%`,
        tone: 'ok',
      });
    }
  }, [backgroundFill, editor, segmentation]);

  const handleApplyBackgroundPlate = useCallback(() => {
    const activePreview = resolveActiveSegmentationPreview(segmentation);
    if (!editor || !segmentation || !activePreview?.backgroundPlateDataUrl) return;
    const targetImage = segmentation.target;

    editor.markHistoryStoppingPoint('apply background plate');
    upsertBackgroundAsset({
      editor,
      targetImage,
      name: 'background plate',
      src: activePreview.backgroundPlateDataUrl,
      mimeType: inferDataUrlMimeType(activePreview.backgroundPlateDataUrl),
      sourceTag: 'plate',
    });

    if (segmentation.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'background plate applied',
        detail:
          segmentation.activeRegionId === null
            ? 'generated clean plate'
            : `generated clean plate · ${segmentation.activeRegionId}`,
        tone: 'ok',
      });
    }
  }, [editor, segmentation]);

  const handleGenerateBackgroundPlate = useCallback(async () => {
    if (!segmentation?.preview) return;

    const activePreview = resolveActiveSegmentationPreview(segmentation);
    if (!activePreview) return;

    const regionId = segmentation.activeRegionId ?? null;

    setSegmentation((current) =>
      current
        ? {
            ...current,
            plateLoading: true,
            error: undefined,
          }
        : current
    );

    if (segmentation.runId) {
      appendRunActivity(segmentation.runId, {
        title: 'generating clean plate',
        detail: regionId ? `selection · ${regionId}` : 'selection · all regions',
      });
    }

    try {
      const response = await fetch('/api/segment/plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'openai',
          sourceUrl: activePreview.sourceDataUrl,
          maskUrl: activePreview.maskDataUrl,
          width: activePreview.width,
          height: activePreview.height,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        plate?: {
          dataUrl: string;
          mimeType: string;
          width: number;
          height: number;
        };
      };

      if (!response.ok || !json.ok || !json.plate) {
        throw new Error(json.error || response.statusText);
      }
      const plate = json.plate;

      if (segmentation.runId) {
        appendRunActivity(segmentation.runId, {
          title: 'clean plate ready',
          detail: regionId ? `selection · ${regionId}` : 'selection · all regions',
          tone: 'ok',
        });
      }

      setSegmentation((current) =>
        current
          ? {
              ...current,
              plateLoading: false,
              generatedPlate: {
                regionId,
                dataUrl: plate.dataUrl,
                mimeType: plate.mimeType,
                width: plate.width,
                height: plate.height,
              },
            }
          : current
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (segmentation.runId) {
        appendRunActivity(segmentation.runId, {
          title: 'clean plate failed',
          detail: message,
          tone: 'error',
        });
      }
      setSegmentation((current) =>
        current
          ? {
              ...current,
              plateLoading: false,
              error: message,
            }
          : current
      );
    }
  }, [segmentation]);

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
  const activeSegmentationPreview = resolveActiveSegmentationPreview(segmentation);

  const dispatchers = useMemo<VoiceDispatchers>(
    () => ({
      focus_format: ({ id }) => {
        if (!editor) return;
        const frames = getFrameShapes(editor);
        const idx = frames.findIndex((frame) => frame.id === id);
        if (idx >= 0) focusFrameAtIndex(editor, idx);
      },
      pan_zoom: ({ artboardId, zoom }) => {
        if (!editor) return;
        if (artboardId) {
          const frames = getFrameShapes(editor);
          const idx = frames.findIndex((frame) => frame.id === artboardId);
          if (idx >= 0) focusFrameAtIndex(editor, idx);
          return;
        }
        switch (zoom) {
          case 'in':
            editor.zoomIn();
            return;
          case 'out':
            editor.zoomOut();
            return;
          case 'fit':
          default:
            zoomToAllFrames(editor);
        }
      },
      remove_background: () => {
        openSegmentation('removebg');
      },
      select_tool: ({ tool }) => {
        handlePrimitiveToolPress(tool);
      },
      set_brush_color: ({ color }) => {
        handleBrushColorChange(color);
      },
      set_brush_size: ({ size }) => {
        handleBrushSizeChange(size);
      },
      adjust_brush_size: ({ delta }) => {
        handleBrushSizeAdjust(delta);
      },
      clear_sketch: () => {
        handleClearSketch();
      },
      confirm_sketch: () => {
        handleConfirmSketch();
      },
      run_capability: ({ definitionId }) => {
        onCapabilityPress?.(definitionId);
      },
      run_generate: async ({ prompt, scope }) => {
        await onVoiceGenerate?.(prompt, scope ?? 'single');
      },
    }),
    [
      editor,
      handleBrushColorChange,
      handleBrushSizeAdjust,
      handleBrushSizeChange,
      handleClearSketch,
      handleConfirmSketch,
      handlePrimitiveToolPress,
      onCapabilityPress,
      onVoiceGenerate,
      openSegmentation,
    ]
  );

  const handleVoiceCaption = useCallback((event: VoiceCaptionEvent) => {
    switch (event.type) {
      case 'state':
        setVoiceState(event.state);
        return;
      case 'transcript':
        setVoiceTranscript(event.speaker, event.text);
        return;
      case 'function':
        setVoiceToolCall(event.name, event.ok, event.detail);
        return;
      case 'error':
        setVoiceError(event.message);
        return;
    }
  }, []);

  const voiceSlot = voiceEnabled
    ? renderVoiceSlot
      ? renderVoiceSlot(dispatchers)
      : <VoiceOrb dispatchers={dispatchers} onCaption={handleVoiceCaption} />
    : null;

  return (
    <section
      ref={canvasRootRef}
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
        layoutGuardEnabled={layoutGuardEnabled}
        onLayoutGuardToggle={onLayoutGuardToggle}
        onApplyGuardedLayout={onApplyGuardedLayout}
        activePrimitiveTool={sketchBrush.tool}
        brushState={sketchBrush}
        onPrimitiveToolPress={handlePrimitiveToolPress}
        onStyleAction={handleStyleAction}
        airBrushActive={airBrushActive}
        onAirBrushToggle={handleAirBrushToggle}
        onAIPress={focusComposer}
        onVerbPress={handleVerb}
        pinnedCapabilities={[...pinnedCapabilities]}
        onCapabilityPress={onCapabilityPress}
        voiceSlot={voiceSlot ?? undefined}
      />

      <AirBrushOverlay
        active={airBrushActive}
        onActiveChange={handleAirBrushToggle}
        onPoint={handleAirBrushPoint}
        onCapture={(dataUrl) => composerRef.current?.addReferenceDataUrl(dataUrl)}
        showInactiveButton={false}
      />

      {motionArtifact ? (
        <MotionArtifactPreview
          artifact={motionArtifact}
          onDismiss={onMotionArtifactDismiss}
        />
      ) : null}

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

      {segmentation &&
      activeSegmentationPreview &&
      segmentation.previewVisible &&
      !segmentation.approved ? (
        <SegmentationPreviewOverlay
          preview={activeSegmentationPreview}
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
        elementsLoading={segmentation?.elementsLoading}
        elementsSummary={segmentation?.elementsSummary}
        elements={segmentation?.elements}
        preview={activeSegmentationPreview}
        previewVisible={segmentation?.previewVisible}
        backgroundFill={backgroundFill}
        onPromptChange={(value) =>
          setSegmentation((current) =>
            current
              ? {
                  ...current,
                  prompt: value,
                  approved: false,
                  activeRegionId: null,
                  generatedPlate: undefined,
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
                  activeRegionId: null,
                  generatedPlate: undefined,
                  preview: undefined,
                  previewVisible: false,
                }
              : current
          )
        }
        activeRegionId={segmentation?.activeRegionId ?? null}
        plateGenerationLoading={segmentation?.plateLoading}
        onActiveRegionChange={(value) =>
          setSegmentation((current) =>
            current
              ? {
                  ...current,
                  activeRegionId: value,
                  error: undefined,
                }
              : current
          )
        }
        onGenerateBackgroundPlate={handleGenerateBackgroundPlate}
        onElementSelect={(prompt) =>
          setSegmentation((current) =>
            current
              ? {
                  ...current,
                  prompt,
                  approved: false,
                  error: undefined,
                  activeRegionId: null,
                  generatedPlate: undefined,
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
        onApplyBackgroundPlate={handleApplyBackgroundPlate}
        onUndo={() => editor?.undo()}
        onRedo={() => editor?.redo()}
      />
    </section>
  );
});
