'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ViewSwitcher, type ViewId } from '@/components/header/ViewSwitcher';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import type { MotionArtifact } from '@/components/canvas/MotionArtifactPreview';
import {
  PromptComposer,
  type ComposerHandle,
  type PromptFormatOption,
} from '@/components/composer/PromptComposer';
import type { ToolbarVerb } from '@/components/canvas/FloatingToolbar';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { PinDialog, type ProposedCapability } from '@/components/capability/PinDialog';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { DEFAULT_ARTBOARDS } from '@/lib/canvas/seedArtboards';
import {
  focusFrameAtIndex,
  getActiveFrameShape,
  getFrameShapes,
  zoomToAllFrames,
} from '@/lib/canvas/focusFrame';
import { dropImageInFrame, pickAspectRatio } from '@/lib/canvas/fanOut';
import type { GuardedLayoutPlan } from '@/lib/canvas/layoutGuard';
import {
  DEFAULT_MANAGED_LAYOUT_COPY,
  applyGuardedCopyLayoutToCanvas,
} from '@/lib/canvas/layoutGuardCanvas';
import {
  readGenerateStream,
  type GenerateStreamEvent,
} from '@/lib/generate/stream';
import type { AspectRatio } from '@/lib/providers/image/types';
import type { RunDetailsRecord } from '@/lib/store/runDetails';
import {
  finishRun,
  failRun,
  startRun,
  stepRun,
  useRuns,
  type CapabilityRunRecord,
} from '@/lib/store/runs';
import {
  appendRunActivity,
  getAllRunDetailsSnapshot,
  initRunDetails,
  patchRunDetails,
  upsertRunFrame,
} from '@/lib/store/runDetails';
import {
  addDefinition,
  getDefinitionById,
  useCapabilityDefinitions,
} from '@/lib/capability/store';
import type { CapabilityDefinitionRecord } from '@/lib/capability/types';
import {
  buildExportRequestBody,
  downloadExportPack,
} from '@/lib/export/client';

const LOG_TAG = '[aether/generate]';
const log = (...args: unknown[]) => {
  if (typeof console !== 'undefined') console.log(LOG_TAG, ...args);
};
const logError = (...args: unknown[]) => {
  if (typeof console !== 'undefined') console.error(LOG_TAG, ...args);
};

interface GenerateResponseJson {
  ok?: boolean;
  error?: string;
  plan?: {
    rewrittenPrompt?: string;
    rationale?: string;
    aspectRatio?: string;
  };
  provider?: {
    id?: string;
    model?: string;
  };
  debug?: {
    plannerMode?: 'anthropic' | 'bypass' | 'fallback';
    plannerModel?: string;
    plannerError?: string;
    toolCall?: {
      name?: string;
      prompt?: string;
      aspectRatio?: string;
      rationale?: string;
      seed?: number;
    };
  };
  result?: {
    latencyMs?: number;
    images?: Array<{
      url: string;
      width: number;
      height: number;
      mimeType: string;
    }>;
  };
}

interface VideoGenerateResponseJson {
  ok?: boolean;
  error?: string;
  provider?: {
    id?: string;
    model?: string;
  };
  artifact?: {
    kind?: string;
    mimeType?: string;
    url?: string;
    html?: string;
    posterUrl?: string;
    width?: number;
    height?: number;
    durationSec?: number;
    fps?: number;
    audioIncluded?: boolean;
  };
  result?: {
    latencyMs?: number;
    sceneSpec?: {
      kind?: string;
      title?: string;
      durationSec?: number;
      size?: {
        w?: number;
        h?: number;
      };
    };
  };
}

export interface WorkspaceShellProps {
  wsId: string;
}

export function WorkspaceShell({ wsId }: WorkspaceShellProps) {
  return (
    <EditorRefProvider>
      <WorkspaceShellInner wsId={wsId} />
    </EditorRefProvider>
  );
}

const VERB_PROMPT_PRESETS: Record<ToolbarVerb, string> = {
  cutout: 'cut out the subject and leave a transparent background',
  unmask: 'reveal everything under the current mask',
  removebg: 'remove the background, keep the subject',
  relight: 'relight the scene with soft directional golden-hour light',
  tone: 'deepen the shadows, sharpen the midtones, keep the highlights calm',
  collage: 'compose a collage from the pinned reference images',
};

interface GenerateTargetSpec {
  id: string;
  label?: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
}

interface FrameShapeSpec {
  id: string;
  props: {
    w: number;
    h: number;
    name?: string;
  };
}

interface RunCompletedEvent {
  type: 'run.completed';
  at: number;
  status: 'ok' | 'partial' | 'error';
  frames: { total: number; completed: number; failed: number };
  provider?: { id: string; model: string };
  rewrittenPrompt?: string;
  rationale?: string;
  aspectRatio?: AspectRatio;
  firstImageUrl?: string;
  imageUrls?: string[];
  elapsedMs: number;
  error?: string;
}

function compactFrameLabel(value?: string): string | undefined {
  if (!value) return undefined;
  const [head] = value.split(' · ');
  return head?.trim() || value;
}

function frameToTargetSpec(frame: FrameShapeSpec): GenerateTargetSpec {
  return {
    id: frame.id,
    label: compactFrameLabel(frame.props.name),
    aspectRatio: pickAspectRatio(frame.props.w, frame.props.h),
    width: frame.props.w,
    height: frame.props.h,
  };
}

type WorkspaceEditor = NonNullable<ReturnType<typeof useEditorRef>['editor']>;

function getLiveTargetSpecs(editor: WorkspaceEditor): GenerateTargetSpec[] {
  return getFrameShapes(editor).map((frame) =>
    frameToTargetSpec(frame as unknown as FrameShapeSpec)
  );
}

function latestImageUrlInFrame(
  editor: WorkspaceEditor,
  frameId: string
): string | null {
  const childIds = editor.getSortedChildIdsForParent(frameId as never);
  for (let index = childIds.length - 1; index >= 0; index -= 1) {
    const child = editor.getShape(childIds[index] as never) as
      | {
          type: string;
          props?: { assetId?: unknown };
          meta?: Record<string, unknown>;
        }
      | undefined;
    if (!child || child.type !== 'image') continue;
    const role = child.meta?.aetherRole;
    if (role === 'background-fill') continue;
    const assetId = child.props?.assetId;
    if (!assetId) continue;
    const asset = editor.getAsset(assetId as never) as
      | { type: string; props?: { src?: string } }
      | undefined;
    const src = asset?.type === 'image' ? asset.props?.src : undefined;
    if (src) return src;
  }
  return null;
}

function buildCanvasExportFallback(
  editor: WorkspaceEditor,
  formats: ReadonlyArray<GenerateTargetSpec>
): { runs: CapabilityRunRecord[]; runDetails: RunDetailsRecord[] } {
  const now = Date.now();
  const frames = formats.flatMap((format) => {
    const imageUrl = latestImageUrlInFrame(editor, format.id);
    if (!imageUrl) return [];
    return [
      {
        id: format.id,
        label: format.label,
        aspectRatio: format.aspectRatio,
        status: 'placed' as const,
        updatedAt: now,
        imageUrl,
      },
    ];
  });

  if (frames.length === 0) return { runs: [], runDetails: [] };

  const runId = `canvas_export_${now}`;
  const run: CapabilityRunRecord = {
    id: runId,
    tool: 'image-gen',
    provider: 'canvas',
    model: 'current-artboard-images',
    prompt: 'current canvas artboards',
    status: 'ok',
    step: 'done',
    startedAt: now,
    finishedAt: now,
  };
  const details: RunDetailsRecord = {
    runId,
    providerHint: run.provider,
    modelHint: run.model,
    activities: [],
    frames,
  };

  return { runs: [run], runDetails: [details] };
}

function shouldRoutePromptToMotion(prompt: string) {
  return /\b(introduce me|intro|motion|video|text[- ]?mask|double[- ]?exposure)\b/i.test(
    prompt
  );
}

function pickMotionSceneKind(prompt: string): 'text-mask' | 'double-exposure' {
  return /double[- ]?exposure|everest|portrait/i.test(prompt)
    ? 'double-exposure'
    : 'text-mask';
}

function motionTextForPrompt(prompt: string) {
  if (/ai engineer/i.test(prompt) && /singapore/i.test(prompt)) {
    return 'AI ENGINEER\\nSINGAPORE';
  }
  const compact = prompt
    .replace(/^introduce me as\s+/i, '')
    .replace(/[.]+$/g, '')
    .trim();
  return compact ? compact.toUpperCase() : 'AETHER\\nHACKATHON';
}

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const { editor } = useEditorRef();
  const definitions = useCapabilityDefinitions();
  const runs = useRuns();
  const [pinTargetRun, setPinTargetRun] = useState<CapabilityRunRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewId>('canvas');
  const [safeZonesVisible, setSafeZonesVisible] = useState(true);
  const [layoutGuardEnabled, setLayoutGuardEnabled] = useState(true);
  const [layoutPlan, setLayoutPlan] = useState<GuardedLayoutPlan | null>(null);
  const [motionArtifact, setMotionArtifact] = useState<MotionArtifact | null>(null);
  // Focus lens cycles through frames via arrow keys; the active format state
  // mirrors this so the composer always shows the current single-format target.
  const [focusIdx, setFocusIdx] = useState(0);
  const [formats, setFormats] = useState<GenerateTargetSpec[]>([]);
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);

  const pinnedCapabilities = useMemo(
    () => definitions.map((d) => ({ id: d.id, label: d.name })),
    [definitions]
  );
  const composerFormats = useMemo<PromptFormatOption[]>(
    () =>
      formats.map((format) => ({
        id: format.id,
        label: format.label ?? format.id,
      })),
    [formats]
  );

  const runImageOnCanvas = useCallback(
    async (
      prompt: string,
      options: {
        definitionId?: string;
        providerOverride?: string;
        modelOverride?: string;
        bypassAgent?: boolean;
        refs?: string[];
        targets?: GenerateTargetSpec[];
      } = {}
    ): Promise<void> => {
      const targets = options.targets ?? [];
      const runId = startRun({
        tool: 'image-gen',
        provider: options.providerOverride ?? 'auto',
        model: options.modelOverride ?? '',
        prompt,
        definitionId: options.definitionId,
      });
      initRunDetails(runId, {
        providerHint: options.providerOverride ?? 'auto',
        modelHint: options.modelOverride,
        frames: targets.map((target) => ({
          id: target.id,
          label: target.label,
          aspectRatio: target.aspectRatio,
          status: 'queued',
          updatedAt: Date.now(),
        })),
      });
      appendRunActivity(runId, {
        title: 'run prepared',
        detail: options.definitionId
          ? 'pinned capability rerun'
          : [
              `provider ${options.providerOverride ?? 'auto'}`,
              options.modelOverride ? `model ${options.modelOverride}` : 'model auto',
              options.bypassAgent ? 'planner bypassed' : 'planner active',
              targets.length > 1 ? `${targets.length} formats` : 'single format',
            ].join(' · '),
      });
      stepRun(runId, 'prepared');

      try {
        stepRun(runId, 'sending');
        appendRunActivity(runId, {
          title: 'sending request',
          detail: options.definitionId ? '/api/capability/rerun' : '/api/generate',
        });

        if (options.definitionId) {
          const def = getDefinitionById(options.definitionId);
          if (!def) {
            appendRunActivity(runId, {
              title: 'capability missing',
              detail: options.definitionId,
              tone: 'error',
            });
            failRun(runId, `unknown capability definition: ${options.definitionId}`);
            return;
          }

          const res = await fetch('/api/capability/rerun', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              definition: def,
              promptOverride: prompt,
              runId,
            }),
          });

          stepRun(runId, 'awaiting');
          appendRunActivity(runId, {
            title: 'awaiting capability response',
            detail: def.name,
          });

          let json: GenerateResponseJson;
          try {
            json = await res.json();
          } catch (err) {
            logError('capability rerun parse failed:', err);
            failRun(runId, `bad JSON response (${res.status})`, res.status);
            return;
          }

          if (!res.ok || !json.ok) {
            const msg =
              typeof json?.error === 'string' ? json.error : res.statusText || 'unknown error';
            appendRunActivity(runId, {
              title: 'generation failed',
              detail: msg,
              tone: 'error',
            });
            failRun(runId, msg, res.status);
            return;
          }

          patchRunDetails(runId, {
            providerHint: json.provider?.id ?? options.providerOverride ?? 'auto',
            modelHint: json.provider?.model ?? options.modelOverride,
          });

          const first = json.result?.images?.[0];
          stepRun(runId, 'placing');
          if (first && editor) {
            try {
              dropImageOnCanvas(editor, {
                url: first.url,
                width: first.width,
                height: first.height,
                mimeType: first.mimeType,
                label: json.plan?.rewrittenPrompt ?? prompt,
              });
            } catch (err) {
              appendRunActivity(runId, {
                title: 'canvas placement failed',
                detail: err instanceof Error ? err.message : String(err),
                tone: 'error',
              });
              failRun(
                runId,
                `canvas drop failed: ${err instanceof Error ? err.message : String(err)}`
              );
              return;
            }
          }

          finishRun(runId, {
            provider: json.provider?.id ?? 'unknown',
            model: json.provider?.model ?? '',
            rewrittenPrompt: json.plan?.rewrittenPrompt,
            rationale: json.plan?.rationale,
            aspectRatio: json.plan?.aspectRatio,
            imageUrl: first?.url,
            latencyMs: json.result?.latencyMs,
            error: editor ? undefined : 'editor not ready — image stored, not placed',
            status: editor ? 'ok' : 'error',
          });
          appendRunActivity(runId, {
            title: editor ? 'placed on canvas' : 'stored result',
            detail: `${def.name} · capability rerun`,
            tone: editor ? 'ok' : 'error',
          });
          return;
        }

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            providerId: options.providerOverride,
            model: options.modelOverride,
            bypassAgent: options.bypassAgent,
            refs: options.refs?.map((url) => ({ url })),
            targets,
            runId,
          }),
        });

        if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
          let json: GenerateResponseJson | null = null;
          try {
            json = (await res.json()) as GenerateResponseJson;
          } catch {
            // ignore
          }
          const msg =
            typeof json?.error === 'string' ? json.error : res.statusText || 'unknown error';
          appendRunActivity(runId, {
            title: 'generation failed',
            detail: msg,
            tone: 'error',
          });
          failRun(runId, msg, res.status);
          return;
        }

        stepRun(runId, 'awaiting');
        appendRunActivity(runId, {
          title: 'stream connected',
          detail: targets.length > 1 ? `${targets.length} formats` : 'single format',
        });

        let finalEvent: RunCompletedEvent | null = null;
        let resolvedPrompt = prompt;
        let resolvedAspect: string | undefined = targets[0]?.aspectRatio;
        let firstImageUrl: string | undefined;
        const imageUrlsByFrame: string[] = [];
        const placementErrors: string[] = [];

        await readGenerateStream(res, async (event) => {
          switch (event.type) {
            case 'run.started': {
              if (targets.length === 0 && event.frames.total === 1) {
                upsertRunFrame(runId, {
                  id: 'canvas',
                  label: 'Canvas',
                  status: 'queued',
                  updatedAt: event.at,
                });
              }
              return;
            }

            case 'planner.started': {
              appendRunActivity(runId, {
                title: 'planning prompt',
                detail: event.plannerModel,
                at: event.at,
              });
              return;
            }

            case 'plan.ready': {
              resolvedPrompt = event.rewrittenPrompt;
              resolvedAspect = event.aspectRatio;
              patchRunDetails(runId, {
                providerHint: event.provider.id,
                modelHint: event.provider.model,
              });

              if (event.plannerMode === 'anthropic' && event.toolCall) {
                appendRunActivity(runId, {
                  title: 'tool call made',
                  detail: [
                    event.plannerModel ?? 'anthropic',
                    event.toolCall.name,
                    event.toolCall.aspectRatio,
                  ].join(' · '),
                  at: event.at,
                });
                appendRunActivity(runId, {
                  title: 'rewrote prompt',
                  detail: event.toolCall.prompt,
                  at: event.at,
                });
              } else if (event.plannerMode === 'fallback') {
                appendRunActivity(runId, {
                  title: 'planner fallback',
                  detail: 'Anthropic unavailable · raw prompt sent to provider',
                  at: event.at,
                });
              } else if (event.plannerMode === 'bypass') {
                appendRunActivity(runId, {
                  title: 'planner bypassed',
                  detail: 'request sent directly to the image provider',
                  at: event.at,
                });
              }
              return;
            }

            case 'frame.started': {
              stepRun(runId, 'awaiting');
              upsertRunFrame(runId, {
                id: event.frame.id,
                label: event.frame.label,
                aspectRatio: event.frame.aspectRatio,
                status: 'running',
                startedAt: event.at,
                updatedAt: event.at,
              });
              appendRunActivity(runId, {
                title: 'dispatching format',
                detail: [
                  event.frame.label ?? event.frame.id,
                  `${event.frame.index}/${event.frame.total}`,
                  event.provider.id,
                  event.provider.model,
                  event.frame.aspectRatio,
                  event.frame.size
                    ? `${Math.round(event.frame.size.w)}x${Math.round(event.frame.size.h)}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · '),
                at: event.at,
              });
              return;
            }

            case 'frame.completed': {
              stepRun(runId, 'placing');
              if (!firstImageUrl) firstImageUrl = event.image.url;
              imageUrlsByFrame[event.frame.index - 1] = event.image.url;
              upsertRunFrame(runId, {
                id: event.frame.id,
                label: event.frame.label,
                aspectRatio: event.frame.aspectRatio,
                status: 'returned',
                startedAt: event.at - event.latencyMs,
                updatedAt: event.at,
                imageUrl: event.image.url,
              });
              appendRunActivity(runId, {
                title: 'provider returned',
                detail: [
                  event.frame.label ?? event.frame.id,
                  event.provider.id,
                  event.provider.model,
                  `${(event.latencyMs / 1000).toFixed(1)}s`,
                ].join(' · '),
                tone: 'ok',
                at: event.at,
              });

              let placementError: string | undefined;
              if (editor) {
                try {
                  if (event.frame.id === 'canvas') {
                    dropImageOnCanvas(editor, {
                      url: event.image.url,
                      width: event.image.width,
                      height: event.image.height,
                      mimeType: event.image.mimeType,
                      label: resolvedPrompt,
                    });
                  } else {
                    const placed = dropImageInFrame(editor, event.frame.id, {
                      url: event.image.url,
                      width: event.image.width,
                      height: event.image.height,
                      mimeType: event.image.mimeType,
                      label: resolvedPrompt,
                    });
                    if (!placed) throw new Error('target frame missing');
                  }
                } catch (err) {
                  placementError =
                    err instanceof Error ? err.message : String(err);
                }
              } else {
                placementError = 'editor not ready — image stored, not placed';
              }

              if (placementError) {
                placementErrors.push(placementError);
                upsertRunFrame(runId, {
                  id: event.frame.id,
                  label: event.frame.label,
                  aspectRatio: event.frame.aspectRatio,
                  status: 'error',
                  startedAt: event.at - event.latencyMs,
                  updatedAt: Date.now(),
                  error: placementError,
                  imageUrl: event.image.url,
                });
                appendRunActivity(runId, {
                  title: 'canvas placement failed',
                  detail: `${event.frame.label ?? event.frame.id} · ${placementError}`,
                  tone: 'error',
                });
              } else {
                upsertRunFrame(runId, {
                  id: event.frame.id,
                  label: event.frame.label,
                  aspectRatio: event.frame.aspectRatio,
                  status: 'placed',
                  startedAt: event.at - event.latencyMs,
                  updatedAt: Date.now(),
                  imageUrl: event.image.url,
                });
                appendRunActivity(runId, {
                  title: 'placed on canvas',
                  detail: event.frame.label ?? event.frame.id,
                  tone: 'ok',
                });
              }
              return;
            }

            case 'frame.failed': {
              upsertRunFrame(runId, {
                id: event.frame.id,
                label: event.frame.label,
                aspectRatio: event.frame.aspectRatio,
                status: 'error',
                startedAt: event.at,
                updatedAt: event.at,
                error: event.error,
              });
              appendRunActivity(runId, {
                title: 'format failed',
                detail: `${event.frame.label ?? event.frame.id} · ${event.error}`,
                tone: 'error',
                at: event.at,
              });
              return;
            }

            case 'run.completed': {
              finalEvent = event;
            }
          }
        });

        const completedEvent = finalEvent as RunCompletedEvent | null;
        if (!completedEvent) {
          failRun(runId, 'stream ended before completion');
          return;
        }

        const finalError =
          placementErrors.length > 0
            ? `${placementErrors.length} placement error${placementErrors.length === 1 ? '' : 's'}`
            : completedEvent.error;
        const finalStatus =
          completedEvent.status === 'ok' && placementErrors.length === 0 ? 'ok' : 'error';

        const orderedImageUrls = imageUrlsByFrame.filter(Boolean);
        finishRun(runId, {
          provider: completedEvent.provider?.id ?? options.providerOverride ?? 'unknown',
          model: completedEvent.provider?.model ?? options.modelOverride ?? '',
          rewrittenPrompt: completedEvent.rewrittenPrompt ?? resolvedPrompt,
          rationale: completedEvent.rationale,
          aspectRatio: completedEvent.aspectRatio ?? resolvedAspect,
          imageUrl: firstImageUrl ?? completedEvent.firstImageUrl,
          outputRefs: orderedImageUrls.length > 0 ? orderedImageUrls : completedEvent.imageUrls,
          latencyMs: completedEvent.elapsedMs,
          error: finalError,
          status: finalStatus,
        });
        appendRunActivity(runId, {
          title:
            finalStatus === 'ok'
              ? 'generation complete'
              : completedEvent.status === 'partial'
              ? 'generation partially complete'
              : 'generation failed',
          detail:
            targets.length > 1
              ? `${completedEvent.frames.completed}/${completedEvent.frames.total} formats placed`
              : finalError,
          tone: finalStatus === 'ok' ? 'ok' : 'error',
          at: completedEvent.at,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('fetch threw:', err);
        appendRunActivity(runId, {
          title: 'request failed',
          detail: message,
          tone: 'error',
        });
        failRun(runId, `fetch failed: ${message}`);
      }
    },
    [editor]
  );

  const runMotionOnCanvas = useCallback(
    async (
      prompt: string,
      options: {
        providerOverride?: string;
        modelOverride?: string;
        sceneKind?: 'text-mask' | 'double-exposure';
        refs?: string[];
      } = {}
    ): Promise<void> => {
      const sceneKind = options.sceneKind ?? pickMotionSceneKind(prompt);
      const inputRefs = options.refs ?? [];
      const motionInputs = {
        prompt,
        refs: inputRefs,
        sceneKind,
      };
      const runId = startRun({
        tool: 'video-gen',
        provider: options.providerOverride ?? 'auto',
        model: options.modelOverride ?? '',
        prompt,
        inputs: motionInputs,
        artifactKind: 'video',
        scope: 'workspace',
      });
      initRunDetails(runId, {
        providerHint: options.providerOverride ?? 'auto',
        modelHint: options.modelOverride,
        frames: [
          {
            id: 'motion-preview',
            label: sceneKind === 'text-mask' ? 'Motion intro' : 'Double exposure',
            aspectRatio: '16:9',
            status: 'queued',
            updatedAt: Date.now(),
          },
        ],
      });
      appendRunActivity(runId, {
        title: 'motion prepared',
        detail: `${sceneKind} · sound on`,
      });

      try {
        stepRun(runId, 'sending');
        const response = await fetch('/api/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            providerId: options.providerOverride,
            model: options.modelOverride,
            scene: {
              kind: sceneKind,
              title:
                sceneKind === 'text-mask'
                  ? 'AI Engineer Intro'
                  : 'Double Exposure Intro',
              text: motionTextForPrompt(prompt),
              ...(sceneKind === 'text-mask' && inputRefs[0]
                ? {
                    media: {
                      kind: 'image',
                      url: inputRefs[0],
                    },
                  }
                : {}),
              ...(sceneKind === 'double-exposure' && inputRefs[0]
                ? {
                    subject: {
                      kind: 'image',
                      url: inputRefs[0],
                      fit: 'contain',
                    },
                  }
                : {}),
              ...(sceneKind === 'double-exposure' && inputRefs[1]
                ? {
                    exposure: {
                      kind: 'image',
                      url: inputRefs[1],
                      fit: 'cover',
                    },
                  }
                : {}),
              durationSec: sceneKind === 'text-mask' ? 4 : 6,
              aspectRatio: '16:9',
              footerTitle: 'AI Engineer · Singapore',
              footerBody:
                'Voice, finger mark, motion, and campaign formats stay inside the same canvas.',
              overlayTitle: 'SINGAPORE',
              body:
                'A portrait, a place, and a hand-drawn mark become a campaign opener.',
            },
          }),
        });
        stepRun(runId, 'awaiting');

        let json: VideoGenerateResponseJson;
        try {
          json = (await response.json()) as VideoGenerateResponseJson;
        } catch {
          failRun(runId, `bad JSON response (${response.status})`, response.status);
          return;
        }

        if (!response.ok || !json.ok || !json.artifact?.html || !json.artifact.url) {
          const message = json.error ?? response.statusText ?? 'motion generation failed';
          appendRunActivity(runId, {
            title: 'motion failed',
            detail: message,
            tone: 'error',
          });
          failRun(runId, message, response.status);
          return;
        }

        stepRun(runId, 'placing');
        const title =
          json.result?.sceneSpec?.title ??
          (sceneKind === 'text-mask' ? 'AI Engineer Intro' : 'Double Exposure Intro');
        const artifact: MotionArtifact = {
          id: `motion_${runId}`,
          runId,
          title,
          sceneKind,
          html: json.artifact.html,
          artifactUrl: json.artifact.url,
          posterUrl: json.artifact.posterUrl,
          provider: json.provider?.id ?? options.providerOverride ?? 'unknown',
          model: json.provider?.model ?? options.modelOverride ?? '',
          durationSec: json.artifact.durationSec ?? json.result?.sceneSpec?.durationSec ?? 4,
          width: json.artifact.width ?? json.result?.sceneSpec?.size?.w ?? 1920,
          height: json.artifact.height ?? json.result?.sceneSpec?.size?.h ?? 1080,
          audioIncluded: Boolean(json.artifact.audioIncluded),
          sourceRef: inputRefs[0],
        };
        setMotionArtifact(artifact);
        upsertRunFrame(runId, {
          id: 'motion-preview',
          label: title,
          aspectRatio: '16:9',
          status: 'placed',
          updatedAt: Date.now(),
          imageUrl: json.artifact.posterUrl,
        });
        finishRun(runId, {
          provider: artifact.provider,
          model: artifact.model,
          rewrittenPrompt: prompt,
          aspectRatio: '16:9',
          imageUrl: artifact.posterUrl,
          latencyMs: json.result?.latencyMs,
          status: 'ok',
          inputs: motionInputs,
          artifactKind: 'video',
          outputRefs: [artifact.artifactUrl],
        });
        appendRunActivity(runId, {
          title: 'motion artifact ready',
          detail: artifact.audioIncluded ? 'HTML composition · sound included' : 'HTML composition',
          tone: 'ok',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendRunActivity(runId, {
          title: 'motion request failed',
          detail: message,
          tone: 'error',
        });
        failRun(runId, `fetch failed: ${message}`);
      }
    },
    []
  );

  useEffect(() => {
    if (!editor) {
      setFormats([]);
      setActiveFormatId(null);
      return;
    }

    const syncFormats = () => {
      const nextFormats = getFrameShapes(editor).map((frame) =>
        frameToTargetSpec(frame as unknown as FrameShapeSpec)
      );
      const selectedFrameId = getActiveFrameShape(editor)?.id ?? null;

      setFormats(nextFormats);
      setActiveFormatId((current) => {
        if (selectedFrameId && nextFormats.some((format) => format.id === selectedFrameId)) {
          return selectedFrameId;
        }
        if (current && nextFormats.some((format) => format.id === current)) return current;
        return nextFormats[0]?.id ?? null;
      });
    };

    syncFormats();
    return editor.store.listen(syncFormats);
  }, [editor]);

  useEffect(() => {
    if (view !== 'focus' || formats.length === 0) return;
    const wrappedIndex = ((focusIdx % formats.length) + formats.length) % formats.length;
    const target = formats[wrappedIndex];
    if (target && target.id !== activeFormatId) setActiveFormatId(target.id);
  }, [view, focusIdx, formats, activeFormatId]);

  useEffect(() => {
    if (view !== 'focus' || !activeFormatId) return;
    const idx = formats.findIndex((format) => format.id === activeFormatId);
    if (idx >= 0 && idx !== focusIdx) setFocusIdx(idx);
  }, [view, activeFormatId, focusIdx, formats]);

  const handleExport = useCallback(async (targetFrameId?: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      const activeFormats =
        targetFrameId && formats.some((format) => format.id === targetFrameId)
          ? formats.filter((format) => format.id === targetFrameId)
          : formats;
      const boards: { id: string; label: string; aspectRatio: string }[] =
        activeFormats.length > 0
          ? activeFormats.map((format) => ({
              id: format.id,
              label: format.label ?? format.id,
              aspectRatio: format.aspectRatio,
            }))
          : DEFAULT_ARTBOARDS.map((seed, idx) => ({
              id: seed.preset ?? `artboard-${idx}`,
              label: seed.name.split(' · ')[0] ?? seed.preset ?? `artboard-${idx}`,
              aspectRatio: pickAspectRatio(seed.w, seed.h),
            }));

      const canvasFallback =
        editor && activeFormats.length > 0
          ? buildCanvasExportFallback(editor, activeFormats)
          : { runs: [], runDetails: [] };
      const { body, skipped } = await buildExportRequestBody({
        workspaceId: wsId,
        artboards: boards,
        runs: [...canvasFallback.runs, ...runs],
        runDetails: [
          ...canvasFallback.runDetails,
          ...getAllRunDetailsSnapshot(),
        ],
        pinnedSkills: definitions.map((def) => ({
          definitionId: def.id,
          name: def.name,
        })),
      });

      const resolvedCount = Array.isArray((body as { artboards?: unknown[] }).artboards)
        ? (body as { artboards: unknown[] }).artboards.length
        : 0;
      if (resolvedCount === 0) {
        log('export skipped · no completed generations to pack');
        if (typeof window !== 'undefined') {
          window.alert(
            skipped.length > 0
              ? targetFrameId
                ? 'nothing to export from this artboard yet'
                : `nothing to export yet — generate on an artboard first (${skipped.length} empty)`
              : 'nothing to export yet — generate on an artboard first'
          );
        }
        return;
      }

      await downloadExportPack(wsId, body);
      log(
        'export downloaded ·',
        resolvedCount,
        targetFrameId ? 'selected format' : 'format(s)',
        '· skipped',
        skipped.length
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('export failed:', message);
      if (typeof window !== 'undefined') window.alert(`export failed: ${message}`);
    } finally {
      setExporting(false);
    }
  }, [editor, exporting, formats, wsId, runs, definitions]);

  const handleApplyGuardedLayout = useCallback(
    (copy = DEFAULT_MANAGED_LAYOUT_COPY) => {
      const runId = startRun({
        tool: 'layout-guard',
        provider: 'deterministic',
        model: 'layout-guard-v1',
        prompt: copy,
        inputs: {
          copy,
          dynamicAdjustment: layoutGuardEnabled,
        },
        scope: 'workspace',
      });
      initRunDetails(runId, {
        providerHint: 'deterministic',
        modelHint: 'layout-guard-v1',
        frames: formats.map((format) => ({
          id: format.id,
          label: format.label,
          aspectRatio: format.aspectRatio,
          status: 'running',
          updatedAt: Date.now(),
        })),
      });
      appendRunActivity(runId, {
        title: 'layout guard prepared',
        detail: layoutGuardEnabled
          ? 'dynamic placement · avoid zones active'
          : 'static placement · validation only',
      });
      stepRun(runId, 'placing');

      if (!editor) {
        const message = 'editor not ready';
        appendRunActivity(runId, {
          title: 'layout failed',
          detail: message,
          tone: 'error',
        });
        failRun(runId, message);
        return;
      }

      try {
        const startedAt = Date.now();
        const result = applyGuardedCopyLayoutToCanvas(editor, {
          copy,
          dynamicAdjustment: layoutGuardEnabled,
        });
        setLayoutPlan(result.plan);

        for (const placement of result.plan.placements) {
          upsertRunFrame(runId, {
            id: placement.frameId,
            label: placement.frameLabel,
            status:
              result.plan.status === 'blocked' && placement.collidingRegionIds.length > 0
                ? 'error'
                : 'placed',
            error:
              placement.collidingRegionIds.length > 0
                ? `${placement.collidingRegionIds.length} protected overlap${placement.collidingRegionIds.length === 1 ? '' : 's'}`
                : undefined,
            updatedAt: Date.now(),
          });
        }

        appendRunActivity(runId, {
          title: 'copy placed',
          detail: `${result.shapeIds.length} text layer${result.shapeIds.length === 1 ? '' : 's'} · ${result.plan.locale}`,
          tone: result.plan.status === 'blocked' ? 'error' : 'ok',
        });
        appendRunActivity(runId, {
          title: 'validation',
          detail:
            result.plan.issues.length === 0
              ? 'ready to schedule'
              : `${result.plan.status} · ${result.plan.issues.length} issue${result.plan.issues.length === 1 ? '' : 's'}`,
          tone: result.plan.status === 'blocked' ? 'error' : 'ok',
        });
        finishRun(runId, {
          status: result.plan.status === 'blocked' ? 'error' : 'ok',
          rewrittenPrompt: 'guarded multilingual copy layout',
          latencyMs: Date.now() - startedAt,
          error:
            result.plan.status === 'blocked'
              ? result.plan.issues.map((issue) => issue.message).join('; ')
              : undefined,
          inputs: {
            copy,
            locale: result.plan.locale,
            dynamicAdjustment: result.plan.dynamicAdjustment,
            avoidRegionCount: result.plan.avoidanceRegions.length,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendRunActivity(runId, {
          title: 'layout failed',
          detail: message,
          tone: 'error',
        });
        failRun(runId, message);
      }
    },
    [editor, formats, layoutGuardEnabled]
  );

  const handlePrompt = useCallback(
    async (
      prompt: string,
      options: { refs?: string[]; scope: 'all' | 'single'; targetId?: string }
    ) => {
      const trimmed = prompt.trim();
      if (/^\/export\b/i.test(trimmed)) {
        log('onSubmit · /export command');
        await handleExport();
        return;
      }

      if (/^\/layout\b/i.test(trimmed)) {
        const copy = trimmed.replace(/^\/layout\b/i, '').trim() || DEFAULT_MANAGED_LAYOUT_COPY;
        log('onSubmit · /layout command');
        handleApplyGuardedLayout(copy);
        return;
      }

      if (shouldRoutePromptToMotion(trimmed)) {
        const urlParams = new URLSearchParams(window.location.search);
        await runMotionOnCanvas(prompt, {
          providerOverride: urlParams.get('videoProvider') ?? undefined,
          modelOverride: urlParams.get('videoModel') ?? undefined,
          refs: options.refs,
        });
        return;
      }

      log(
        'onSubmit · prompt:',
        prompt,
        'refs:',
        options.refs?.length ?? 0,
        'scope:',
        options.scope,
        'target:',
        options.targetId ?? activeFormatId ?? 'canvas'
      );
      const urlParams = new URLSearchParams(window.location.search);
      const providerOverride = urlParams.get('provider') ?? undefined;
      const modelOverride = urlParams.get('model') ?? undefined;
      // `?bypass=1` skips the Claude planner and pipes the prompt straight
      // to the provider. Useful when the Anthropic key is rate-limited or
      // out of credits, or to demo the raw provider without Claude's rewrite.
      const bypassAgent = urlParams.get('bypass') === '1';

      const liveFormats = editor ? getLiveTargetSpecs(editor) : [];
      const availableFormats = liveFormats.length > 0 ? liveFormats : formats;

      if (options.scope === 'all') {
        const targets = availableFormats;
        if (targets.length > 0) {
          log('fan-out · frames:', targets.length, 'source:', liveFormats.length > 0 ? 'canvas' : 'state');
          await runImageOnCanvas(prompt, {
            providerOverride,
            modelOverride,
            bypassAgent,
            refs: options.refs,
            targets,
          });
          return;
        }
      }

      // scope='single' (or 'all' on an empty canvas): one generation. When the
      // creator picks a single target, drop into that frame with its own aspect
      // ratio. If no explicit target exists, fall back to the focus lens.
      let targets: GenerateTargetSpec[] | undefined;
      const targetId = options.targetId ?? activeFormatId;
      const explicitTarget = targetId
        ? availableFormats.find((format) => format.id === targetId)
        : undefined;
      if (explicitTarget) {
        targets = [explicitTarget];
      } else if (view === 'focus' && availableFormats.length > 0) {
        const wrappedIndex =
          ((focusIdx % availableFormats.length) + availableFormats.length) %
          availableFormats.length;
        const target = availableFormats[wrappedIndex];
        if (target) targets = [target];
      }

      await runImageOnCanvas(prompt, {
        providerOverride,
        modelOverride,
        bypassAgent,
        refs: options.refs,
        targets,
      });
    },
    [
      runImageOnCanvas,
      runMotionOnCanvas,
      editor,
      view,
      focusIdx,
      formats,
      activeFormatId,
      handleExport,
      handleApplyGuardedLayout,
    ]
  );

  const handlePin = useCallback((run: CapabilityRunRecord) => {
    setPinTargetRun(run);
  }, []);

  const handlePinAccept = useCallback(
    (proposal: ProposedCapability, run: CapabilityRunRecord) => {
      const def: CapabilityDefinitionRecord = addDefinition({
        name: proposal.name,
        trigger: proposal.trigger,
        paramSchema: proposal.paramSchema,
        notes: proposal.notes,
        exampleRunId: run.id,
        createdBy: 'agent',
        tool: run.tool,
        provider: run.provider,
        runTemplate: {
          prompt: run.rewrittenPrompt ?? run.prompt,
          aspectRatio: run.aspectRatio,
          providerId: run.provider === 'auto' ? undefined : run.provider,
          model: run.model || undefined,
        },
      });
      log('pinned capability:', def.id, '·', def.name);
      setPinTargetRun(null);
    },
    []
  );

  const handleCapabilityPress = useCallback(
    async (definitionId: string) => {
      const def = getDefinitionById(definitionId);
      if (!def) return;
      const prompt = def.runTemplate.prompt ?? def.trigger;
      log('rerun capability:', def.id, '·', prompt);
      await runImageOnCanvas(prompt, { definitionId });
    },
    [runImageOnCanvas]
  );

  const handleVerbPress = useCallback((verb: ToolbarVerb) => {
    // Prefill the composer with a prompt preset for the verb and focus it.
    // The creator can tweak the preset and submit; no implicit generation yet.
    composerRef.current?.setPrompt(VERB_PROMPT_PRESETS[verb]);
  }, []);

  // Focus lens is a camera/selection change, not a chrome toggle. When view
  // flips to 'focus' we zoom to a single artboard; arrow keys cycle through
  // frames in document order. Switching back to 'canvas' zooms to fit every
  // frame — the panoramic default. Rails stay mounted in both lenses.
  useEffect(() => {
    if (!editor) return;
    if (view === 'focus') {
      const resolved = focusFrameAtIndex(editor, focusIdx);
      if (resolved !== null && resolved !== focusIdx) setFocusIdx(resolved);
    } else {
      zoomToAllFrames(editor);
    }
  }, [view, focusIdx, editor]);

  // ⌘+. / Ctrl+. toggles the focus lens globally.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut =
        event.key === '.' && (event.metaKey || event.ctrlKey) && !event.shiftKey;
      if (!isShortcut) return;
      event.preventDefault();
      setView((prev) => (prev === 'focus' ? 'canvas' : 'focus'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Arrow keys cycle through frames while the focus lens is active. No-op
  // in canvas mode so creators can still use arrows to nudge selected shapes.
  useEffect(() => {
    if (view !== 'focus') return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setFocusIdx((i) => i + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setFocusIdx((i) => i - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-bg">
      <Surface
        as="header"
        tone="panel"
        taxonomy="navigation"
        border="soft"
        className="grid h-header grid-cols-3 items-center px-4"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-base tracking-tight">aether</span>
          <span className="text-ink-faint" aria-hidden>
            /
          </span>
          <span className="font-caption text-ink-dim">workspace · {wsId}</span>
        </div>
        <div className="flex justify-center">
          <ViewSwitcher view={view} onChangeView={setView} />
        </div>
        <div
          className="flex items-center justify-end gap-2"
          data-taxonomy="metadata"
        >
          <Chip tone="neutral" size="sm">
            scaffold
          </Chip>
          <Chip tone="ok" size="sm">
            stg
          </Chip>
          <ThemeToggle />
        </div>
      </Surface>

      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <CanvasSubstrate
          workspaceKey={wsId}
          composerRef={composerRef}
          safeZonesVisible={safeZonesVisible}
          onSafeZonesToggle={setSafeZonesVisible}
          layoutGuardEnabled={layoutGuardEnabled}
          onLayoutGuardToggle={setLayoutGuardEnabled}
          onApplyGuardedLayout={() => handleApplyGuardedLayout()}
          onExportFrame={(frameId) => handleExport(frameId)}
          pinnedCapabilities={pinnedCapabilities}
          onCapabilityPress={handleCapabilityPress}
          onVerbPress={handleVerbPress}
          onVoiceGenerate={async (prompt, scope) => {
            await handlePrompt(prompt, { scope });
          }}
          motionArtifact={motionArtifact}
          onMotionArtifactDismiss={() => setMotionArtifact(null)}
        />
        <RightRail
          onPin={handlePin}
          onExport={handleExport}
          exportDisabled={exporting}
          safeZonesVisible={safeZonesVisible}
          layoutGuardEnabled={layoutGuardEnabled}
          layoutPlan={layoutPlan}
          formats={composerFormats}
        />
      </div>

      <PromptComposer
        ref={composerRef}
        onSubmit={handlePrompt}
        inputCount={0}
        formatCount={formats.length > 0 ? formats.length : DEFAULT_ARTBOARDS.length}
        formats={composerFormats}
        activeFormatId={activeFormatId ?? undefined}
        onActiveFormatChange={setActiveFormatId}
        className="h-composer"
      />
      <ComposerStatus />

      <PinDialog
        run={pinTargetRun}
        open={pinTargetRun !== null}
        onAccept={handlePinAccept}
        onReject={() => setPinTargetRun(null)}
      />
    </div>
  );
}
