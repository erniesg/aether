'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ViewSwitcher, type ViewId } from '@/components/header/ViewSwitcher';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import {
  PromptComposer,
  type ComposerHandle,
  type PromptFormatOption,
} from '@/components/composer/PromptComposer';
import type { ToolbarVerb } from '@/components/canvas/FloatingToolbar';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { PinDialog, type ProposedCapability } from '@/components/capability/PinDialog';
import { PublishPreview } from '@/components/workspace/PublishPreview';
import { SettingsPopover } from '@/components/workspace/SettingsPopover';
import {
  useWorkspaceProviderPrefs,
  useSaveWorkspaceProviderPrefs,
} from '@/lib/providers/prefs-store';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import { useScheduledPosts, getPreviewPublisher } from '@/lib/publisher/store';
import { useReferences } from '@/lib/references/store';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { getSelectedImageInfo, type SelectedImageInfo } from '@/lib/canvas/selectedImage';
import { DEFAULT_ARTBOARDS } from '@/lib/canvas/seedArtboards';
import {
  focusFrameAtIndex,
  getActiveFrameShape,
  getFrameShapes,
  zoomToAllFrames,
} from '@/lib/canvas/focusFrame';
import { dropImageInFrame, pickAspectRatio } from '@/lib/canvas/fanOut';
import {
  readGenerateStream,
  type GenerateStreamEvent,
} from '@/lib/generate/stream';
import type { AspectRatio } from '@/lib/providers/image/types';
import type { SpatialFormat, SpatialQuality } from '@/lib/providers/spatial/types';
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
import {
  resolveCapabilityDefinitionEntryRef,
  type CapabilityDefinitionRecord,
} from '@/lib/capability/types';
import { resolveCapabilityRequest } from '@/lib/capability/request';
import { resolveToolEntryRef } from '@/lib/tool/registry';
import { placeSpatialPreviewOnCanvas } from '@/lib/spatial/canvas';
import {
  buildExportRequestBody,
  downloadExportPack,
} from '@/lib/export/client';
import {
  buildCreatorGenerationPrompt,
  countCreatorInputs,
  mergeReferenceUrls,
  visualReferenceUrls,
} from '@/lib/context/model';
import { useCreatorContext } from '@/lib/context/creator-store';

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

interface SpatialResponseJson {
  ok?: boolean;
  error?: string;
  artifactKind?: 'spatial';
  plan?: {
    rewrittenPrompt?: string;
    aspectRatio?: string;
  };
  provider?: {
    id?: string;
    model?: string;
  };
  preview?: {
    imageDataUrl?: string;
    width?: number;
    height?: number;
  };
  result?: {
    format?: 'particle-field' | 'gaussian-splat';
    latencyMs?: number;
    sceneSpec?: {
      kind?: string;
      pointCount?: number;
    };
    images?: Array<{
      url: string;
      width: number;
      height: number;
      mimeType: string;
    }>;
  };
}

interface FactoryResponseJson {
  ok?: boolean;
  error?: string;
  creatorMessage?: string;
  plan?: {
    action?: string;
    reviewRoute?: string;
    humanReviewRequired?: boolean;
  };
  issue?: {
    number?: number;
    url?: string;
    title?: string;
  };
  draftInvocation?: {
    toolId?: 'spatial-gen';
    providerId?: string;
    model?: string;
    format?: SpatialFormat;
    quality?: SpatialQuality;
  };
  draftCapability?: {
    name?: string;
    trigger?: string;
    notes?: string;
    tool?: string;
    provider?: string;
    entryRef?: CapabilityDefinitionRecord['entryRef'];
    runTemplate?: CapabilityDefinitionRecord['runTemplate'];
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
  };
}

function resolveTargetFrame(
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

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const { editor } = useEditorRef();
  const definitions = useCapabilityDefinitions();
  const runs = useRuns();
  const references = useReferences(wsId);
  const creatorContext = useCreatorContext(wsId);
  const providerPrefs = useWorkspaceProviderPrefs(wsId);
  const saveProviderPrefs = useSaveWorkspaceProviderPrefs();
  const [pinTargetRun, setPinTargetRun] = useState<CapabilityRunRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewId>('canvas');
  const [safeZonesVisible, setSafeZonesVisible] = useState(true);
  const [publishPreviewOpen, setPublishPreviewOpen] = useState(false);
  useEffect(() => {
    // Deep-link: `?publishPreview=<id>` opens the overlay on mount. The
    // PreviewPublisher returns this URL from schedule() so a shared link lands
    // the viewer straight on the preview.
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('publishPreview')) setPublishPreviewOpen(true);
  }, []);
  const scheduledPosts = useScheduledPosts(wsId);
  const heroMediaUrls = useMemo(() => {
    for (const run of runs.filter((r) => r.status === 'ok')) {
      const details = getAllRunDetailsSnapshot().find((entry) => entry.runId === run.id);
      const frameUrls =
        details?.frames
          .filter((frame) => frame.status !== 'error' && frame.imageUrl)
          .map((frame) => frame.imageUrl!)
          .filter((url, index, all) => all.indexOf(url) === index) ?? [];
      if (frameUrls.length > 0) return frameUrls;
      if (run.imageUrl) return [run.imageUrl];
    }
    return [];
  }, [runs]);
  const pinnedReferenceUrls = useMemo(() => visualReferenceUrls(references), [references]);
  const inputCount = useMemo(
    () => countCreatorInputs(creatorContext, references),
    [creatorContext, references]
  );
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
      const definition = options.definitionId ? getDefinitionById(options.definitionId) : undefined;
      const runId = startRun({
        tool: 'image-gen',
        provider: options.providerOverride ?? 'auto',
        model: options.modelOverride ?? '',
        prompt,
        definitionId: options.definitionId,
        definitionVersion: definition?.version,
        entryRef: definition ? resolveCapabilityDefinitionEntryRef(definition) : undefined,
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

      // Lifted out of the try-block so the catch handler can clear them after
      // an AbortError. Block-scoped lets aren't visible across catch in TS.
      const STREAM_STALE_MS = 120_000;
      const abortCtrl = new AbortController();
      let staleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetStaleTimer = () => {
        if (staleTimer) clearTimeout(staleTimer);
        staleTimer = setTimeout(() => {
          appendRunActivity(runId, {
            title: 'generation timed out',
            detail: `no events for ${STREAM_STALE_MS / 1000}s — aborting`,
            tone: 'error',
          });
          abortCtrl.abort();
        }, STREAM_STALE_MS);
      };

      try {
        stepRun(runId, 'sending');
        appendRunActivity(runId, {
          title: 'sending request',
          detail: options.definitionId ? '/api/capability/rerun' : '/api/generate',
        });

        if (options.definitionId) {
          const def = definition;
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

        // Stream generation can hang silently if the SSE connection drops
        // mid-stream (Cloudflare edge keepalive flake, upstream provider stall
        // after frame.completed, etc.). Two safety nets in place:
        //   1. AbortController so the fetch is cancellable.
        //   2. A stale-event timer that aborts if no event has arrived in
        //      STREAM_STALE_MS. The server-side per-provider timeout is 60s,
        //      so 120s here gives the slowest provider (chained edits) headroom.
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortCtrl.signal,
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
          if (staleTimer) clearTimeout(staleTimer);
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
        resetStaleTimer();

        let finalEvent: RunCompletedEvent | null = null;
        let resolvedPrompt = prompt;
        let resolvedAspect: string | undefined = targets[0]?.aspectRatio;
        let firstImageUrl: string | undefined;
        const placementErrors: string[] = [];

        await readGenerateStream(res, async (event) => {
          resetStaleTimer();
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
                ].join(' · '),
                at: event.at,
              });
              return;
            }

            case 'frame.completed': {
              stepRun(runId, 'placing');
              if (!firstImageUrl) firstImageUrl = event.image.url;
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

        if (staleTimer) clearTimeout(staleTimer);

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

        finishRun(runId, {
          provider: completedEvent.provider?.id ?? options.providerOverride ?? 'unknown',
          model: completedEvent.provider?.model ?? options.modelOverride ?? '',
          rewrittenPrompt: completedEvent.rewrittenPrompt ?? resolvedPrompt,
          rationale: completedEvent.rationale,
          aspectRatio: completedEvent.aspectRatio ?? resolvedAspect,
          imageUrl: firstImageUrl ?? completedEvent.firstImageUrl,
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
        if (staleTimer) clearTimeout(staleTimer);
        const aborted =
          err instanceof DOMException && err.name === 'AbortError';
        const message = aborted
          ? 'aborted (stale stream or user cancel)'
          : err instanceof Error
            ? err.message
            : String(err);
        if (!aborted) logError('fetch threw:', err);
        appendRunActivity(runId, {
          title: aborted ? 'generation aborted' : 'request failed',
          detail: message,
          tone: 'error',
        });
        failRun(runId, aborted ? message : `fetch failed: ${message}`);
      }
    },
    [editor]
  );

  const runSpatialOnCanvas = useCallback(
    async (
      prompt: string,
      options: {
        definitionId?: string;
        providerOverride?: string;
        modelOverride?: string;
        formatOverride?: SpatialFormat;
        qualityOverride?: SpatialQuality;
      } = {}
    ): Promise<void> => {
      if (!editor) return;

      const targetImage = getSelectedImageInfo(editor);
      if (!targetImage) {
        const message = 'select an image on the canvas first to build a spatial draft';
        log(message);
        if (typeof window !== 'undefined') window.alert(message);
        return;
      }

      const definition = options.definitionId ? getDefinitionById(options.definitionId) : undefined;
      const format =
        options.formatOverride ?? definition?.runTemplate.format ?? 'gaussian-splat';
      const quality =
        options.qualityOverride ?? definition?.runTemplate.quality ?? 'draft';
      const runId = startRun({
        tool: 'spatial-gen',
        artifactKind: 'spatial',
        outputFormat: format,
        quality,
        sourceMode: 'selected-image',
        sourceImageShapeId: targetImage.shapeId,
        provider: options.providerOverride ?? definition?.runTemplate.providerId ?? 'draft',
        model: options.modelOverride ?? definition?.runTemplate.model ?? 'particle-field-v1',
        prompt,
        definitionId: options.definitionId,
        definitionVersion: definition?.version,
        entryRef: definition ? resolveCapabilityDefinitionEntryRef(definition) : resolveToolEntryRef('spatial-gen'),
      });
      const frame = resolveTargetFrame(editor, targetImage);
      initRunDetails(runId, {
        providerHint: options.providerOverride ?? definition?.runTemplate.providerId ?? 'draft',
        modelHint: options.modelOverride ?? definition?.runTemplate.model,
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
        detail: frame?.label ?? targetImage.shapeId,
      });
      appendRunActivity(runId, {
        title: options.definitionId ? 'rerunning spatial capability' : 'building spatial draft',
        detail: `${format} · ${quality}`,
      });
      stepRun(runId, 'awaiting');

      try {
        let response: Response;
        if (options.definitionId) {
          if (!definition) {
            failRun(runId, `unknown capability definition: ${options.definitionId}`);
            return;
          }
          response = await fetch('/api/capability/rerun', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              definition,
              promptOverride: prompt,
              runId,
              targetImage: {
                sourceUrl: targetImage.sourceUrl,
                width: targetImage.intrinsicWidth,
                height: targetImage.intrinsicHeight,
                shapeId: targetImage.shapeId,
              },
            }),
          });
        } else {
          response = await fetch('/api/spatial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceUrl: targetImage.sourceUrl,
              width: targetImage.intrinsicWidth,
              height: targetImage.intrinsicHeight,
              prompt,
              format,
              quality,
              providerId: options.providerOverride,
              model: options.modelOverride,
            }),
          });
        }

        let json: SpatialResponseJson;
        try {
          json = await response.json();
        } catch (err) {
          failRun(runId, `bad JSON response (${response.status})`, response.status);
          logError('spatial parse failed:', err);
          return;
        }

        const image =
          json.result?.images?.[0] ??
          (json.preview?.imageDataUrl
            ? {
                url: json.preview.imageDataUrl,
                width: json.preview.width ?? targetImage.intrinsicWidth,
                height: json.preview.height ?? targetImage.intrinsicHeight,
                mimeType: 'image/svg+xml',
              }
            : undefined);

        if (!response.ok || !json.ok || !image) {
          const message =
            typeof json?.error === 'string' ? json.error : response.statusText || 'spatial draft failed';
          appendRunActivity(runId, {
            title: 'spatial preview failed',
            detail: message,
            tone: 'error',
          });
          failRun(runId, message, response.status);
          return;
        }

        stepRun(runId, 'placing');
        placeSpatialPreviewOnCanvas(editor, targetImage, {
          previewImageUrl: image.url,
          width: image.width,
          height: image.height,
          label: json.result?.format === 'particle-field' ? 'particle field draft' : 'gaussian splat draft',
          providerId: json.provider?.id ?? 'draft',
          format: json.result?.format ?? format,
        });
        if (frame) {
          upsertRunFrame(runId, {
            id: frame.id,
            label: frame.label,
            aspectRatio: frame.aspectRatio,
            status: 'placed',
            imageUrl: image.url,
          });
        }
        finishRun(runId, {
          provider: json.provider?.id ?? 'draft',
          model: json.provider?.model ?? 'particle-field-v1',
          rewrittenPrompt: json.plan?.rewrittenPrompt ?? prompt,
          imageUrl: image.url,
          latencyMs: json.result?.latencyMs,
          outputFormat: json.result?.format ?? format,
          quality,
          status: 'ok',
        });
        appendRunActivity(runId, {
          title: 'spatial draft placed',
          detail:
            json.result?.sceneSpec?.pointCount !== undefined
              ? `${json.result.sceneSpec.pointCount} particles`
              : json.result?.format ?? format,
          tone: 'ok',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('spatial run failed:', message);
        failRun(runId, `fetch failed: ${message}`);
      }
    },
    [editor]
  );

  const requestCapabilityFactory = useCallback(
    async (
      prompt: string,
      options: {
        artifactKind: 'spatial';
        sourceMode: 'selected-image';
      }
    ): Promise<void> => {
      const runId = startRun({
        tool: 'capability-factory',
        provider: 'github',
        model: 'claude-run',
        prompt,
        artifactKind: options.artifactKind,
      });
      initRunDetails(runId, {
        providerHint: 'github',
        modelHint: 'claude-run',
      });
      appendRunActivity(runId, {
        title: 'missing capability detected',
        detail: `${options.artifactKind} · requesting managed-agent build`,
      });
      stepRun(runId, 'sending');

      try {
        const response = await fetch('/api/capability/factory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            artifactKind: options.artifactKind,
            publishScope: 'team',
            sourceMode: options.sourceMode,
          }),
        });

        let json: FactoryResponseJson;
        try {
          json = await response.json();
        } catch (err) {
          failRun(runId, `bad JSON response (${response.status})`, response.status);
          logError('factory parse failed:', err);
          return;
        }

        if (!response.ok || !json.ok || !json.plan?.action) {
          const message =
            typeof json?.error === 'string'
              ? json.error
              : response.statusText || 'capability factory failed';
          appendRunActivity(runId, {
            title: 'factory request failed',
            detail: message,
            tone: 'error',
          });
          failRun(runId, message, response.status);
          return;
        }

        if (json.issue?.number) {
          appendRunActivity(runId, {
            title: 'authoring issue opened',
            detail: `#${json.issue.number} · ${json.plan.reviewRoute ?? 'claude-run'}`,
            tone: 'ok',
          });
        }

        let definitionId: string | undefined;
        if (
          typeof json.draftCapability?.name === 'string' &&
          typeof json.draftCapability?.trigger === 'string' &&
          typeof json.draftCapability?.tool === 'string' &&
          typeof json.draftCapability?.provider === 'string' &&
          json.draftCapability.entryRef &&
          json.draftCapability.runTemplate
        ) {
          const existing = definitions.find(
            (definition) =>
              definition.name === json.draftCapability?.name ||
              definition.trigger === json.draftCapability?.trigger
          );
          const definition =
            existing ??
            addDefinition({
              name: json.draftCapability.name,
              trigger: json.draftCapability.trigger,
              paramSchema: {
                type: 'object',
                properties: {
                  layerId: { type: 'string' },
                },
                required: ['layerId'],
              },
              notes: json.draftCapability.notes,
              createdBy: 'agent',
              tool: json.draftCapability.tool,
              provider: json.draftCapability.provider,
              entryRef: json.draftCapability.entryRef,
              runTemplate: json.draftCapability.runTemplate,
            });
          definitionId = definition.id;
          appendRunActivity(runId, {
            title: existing ? 'draft capability reused' : 'draft capability added',
            detail: definition.name,
            tone: 'ok',
          });
        }

        finishRun(runId, {
          provider: 'github',
          model: 'claude-run',
          rewrittenPrompt: prompt,
          rationale: json.creatorMessage,
          status: 'ok',
        });

        if (json.draftInvocation?.toolId === 'spatial-gen') {
          await runSpatialOnCanvas(prompt, {
            definitionId,
            providerOverride: json.draftInvocation.providerId,
            modelOverride: json.draftInvocation.model,
            formatOverride: json.draftInvocation.format,
            qualityOverride: json.draftInvocation.quality,
          });
          return;
        }

        if (json.creatorMessage && typeof window !== 'undefined') {
          window.alert(json.creatorMessage);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('factory run failed:', err);
        failRun(runId, `factory failed: ${message}`);
      }
    },
    [definitions, runSpatialOnCanvas]
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

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const boards: { id: string; label: string; aspectRatio: string }[] =
        formats.length > 0
          ? formats.map((format) => ({
              id: format.id,
              label: format.label ?? format.id,
              aspectRatio: format.aspectRatio,
            }))
          : DEFAULT_ARTBOARDS.map((seed, idx) => ({
              id: seed.preset ?? `artboard-${idx}`,
              label: seed.name.split(' · ')[0] ?? seed.preset ?? `artboard-${idx}`,
              aspectRatio: pickAspectRatio(seed.w, seed.h),
            }));

      const { body, skipped } = await buildExportRequestBody({
        workspaceId: wsId,
        artboards: boards,
        runs,
        runDetails: getAllRunDetailsSnapshot(),
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
              ? `nothing to export yet — generate on an artboard first (${skipped.length} empty)`
              : 'nothing to export yet — generate on an artboard first'
          );
        }
        return;
      }

      await downloadExportPack(wsId, body);
      log('export downloaded ·', resolvedCount, 'format(s) · skipped', skipped.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('export failed:', message);
      if (typeof window !== 'undefined') window.alert(`export failed: ${message}`);
    } finally {
      setExporting(false);
    }
  }, [exporting, formats, wsId, runs, definitions]);

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

      const requestPlan = resolveCapabilityRequest({
        prompt,
        hasSelectedImage: Boolean(editor && getSelectedImageInfo(editor)),
        definitions,
      });

      if (requestPlan.kind === 'needs-selected-image') {
        log(requestPlan.reason);
        if (typeof window !== 'undefined') window.alert(requestPlan.reason);
        return;
      }

      if (requestPlan.kind === 'definition') {
        const definition = getDefinitionById(requestPlan.definitionId);
        if (!definition) return;
        if (definition.tool === 'spatial-gen') {
          await runSpatialOnCanvas(definition.runTemplate.prompt ?? prompt, {
            definitionId: definition.id,
            providerOverride,
            modelOverride,
            formatOverride: definition.runTemplate.format,
            qualityOverride: definition.runTemplate.quality,
          });
          return;
        }
        await runImageOnCanvas(definition.runTemplate.prompt ?? prompt, {
          definitionId: definition.id,
        });
        return;
      }

      if (requestPlan.kind === 'factory') {
        await requestCapabilityFactory(prompt, {
          artifactKind: requestPlan.artifactKind,
          sourceMode: requestPlan.sourceMode,
        });
        return;
      }

      if (requestPlan.kind === 'tool' && requestPlan.toolId === 'spatial-gen') {
        await runSpatialOnCanvas(prompt, {
          providerOverride,
          modelOverride,
          formatOverride: requestPlan.spatialFormat,
          qualityOverride: 'draft',
        });
        return;
      }

      if (options.scope === 'all' && editor) {
        if (formats.length > 0) {
          const targets = formats;
          const contextualPrompt = buildCreatorGenerationPrompt(
            creatorContext,
            prompt,
            references
          );
          const refs = mergeReferenceUrls(options.refs, pinnedReferenceUrls);
          log('fan-out · frames:', targets.length);
          await runImageOnCanvas(contextualPrompt, {
            providerOverride,
            modelOverride,
            bypassAgent,
            refs: refs.length > 0 ? refs : undefined,
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
      const explicitTarget = targetId ? formats.find((format) => format.id === targetId) : undefined;
      if (explicitTarget) {
        targets = [explicitTarget];
      } else if (view === 'focus' && formats.length > 0) {
        const wrappedIndex = ((focusIdx % formats.length) + formats.length) % formats.length;
        const target = formats[wrappedIndex];
        if (target) targets = [target];
      }

      const contextualPrompt = buildCreatorGenerationPrompt(
        creatorContext,
        prompt,
        references
      );
      const refs = mergeReferenceUrls(options.refs, pinnedReferenceUrls);

      await runImageOnCanvas(contextualPrompt, {
        providerOverride,
        modelOverride,
        bypassAgent,
        refs: refs.length > 0 ? refs : undefined,
        targets,
      });
    },
    [
      runImageOnCanvas,
      runSpatialOnCanvas,
      requestCapabilityFactory,
      editor,
      definitions,
      view,
      focusIdx,
      formats,
      activeFormatId,
      handleExport,
      pinnedReferenceUrls,
      references,
      creatorContext,
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
        entryRef: resolveToolEntryRef(run.tool),
        runTemplate: {
          prompt: run.rewrittenPrompt ?? run.prompt,
          aspectRatio: run.aspectRatio,
          providerId: run.provider === 'auto' ? undefined : run.provider,
          model: run.model || undefined,
          artifactKind: run.artifactKind,
          format: run.outputFormat,
          quality: run.quality,
          sourceMode: run.sourceMode,
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
      if (def.tool === 'spatial-gen') {
        await runSpatialOnCanvas(prompt, {
          definitionId,
          formatOverride: def.runTemplate.format,
          qualityOverride: def.runTemplate.quality,
        });
        return;
      }
      await runImageOnCanvas(prompt, { definitionId });
    },
    [runImageOnCanvas, runSpatialOnCanvas]
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
          data-taxonomy="navigation"
        >
          <SettingsPopover
            prefs={providerPrefs ?? ({} as WorkspaceProviderPrefs)}
            onSave={(next) => saveProviderPrefs(wsId, next)}
          />
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
        <LeftRail workspaceId={wsId} />
        <CanvasSubstrate
          workspaceId={wsId}
          composerRef={composerRef}
          safeZonesVisible={safeZonesVisible}
          onSafeZonesToggle={setSafeZonesVisible}
          pinnedCapabilities={pinnedCapabilities}
          onCapabilityPress={handleCapabilityPress}
          onVerbPress={handleVerbPress}
          onSpatializeFromSelection={async ({ prompt, format, quality }) => {
            await runSpatialOnCanvas(prompt, {
              formatOverride: format,
              qualityOverride: quality,
            });
          }}
          onVoiceGenerate={async (prompt, scope) => {
            await handlePrompt(prompt, { scope });
          }}
          onMoodboardGenerate={async (prompt) => {
            await handlePrompt(prompt, { scope: 'single' });
          }}
        />
        <RightRail
          onPin={handlePin}
          onExport={handleExport}
          exportDisabled={exporting}
          safeZonesVisible={safeZonesVisible}
          workspaceId={wsId}
          heroMediaUrls={heroMediaUrls}
          onOpenPublishPreview={() => setPublishPreviewOpen(true)}
        />
      </div>

      <PromptComposer
        ref={composerRef}
        onSubmit={handlePrompt}
        activeInputSet={creatorContext.campaign.name}
        inputCount={inputCount}
        formatCount={formats.length > 0 ? formats.length : DEFAULT_ARTBOARDS.length}
        formats={composerFormats}
        activeFormatId={activeFormatId ?? undefined}
        onActiveFormatChange={setActiveFormatId}
        onOpenInputSet={() => {
          document
            .querySelector<HTMLButtonElement>('[data-rail-section="references"]')
            ?.click();
        }}
        className="h-composer"
      />
      <ComposerStatus />

      <PinDialog
        run={pinTargetRun}
        open={pinTargetRun !== null}
        onAccept={handlePinAccept}
        onReject={() => setPinTargetRun(null)}
      />

      {publishPreviewOpen ? (
        <div
          role="dialog"
          aria-label="publish preview"
          data-testid="publish-preview-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-panel/70 backdrop-blur-sm"
          onClick={() => setPublishPreviewOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-[min(640px,90vw)] flex-col gap-3 overflow-y-auto rounded-md border border-border bg-surface-panel p-4 shadow-md"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border-soft pb-2">
              <span className="font-caption text-ink">publish preview</span>
              <button
                type="button"
                onClick={() => setPublishPreviewOpen(false)}
                data-testid="publish-preview-close"
                className="font-caption text-2xs uppercase tracking-wide text-ink-dim hover:text-ink"
              >
                close
              </button>
            </header>
            <PublishPreview
              posts={scheduledPosts}
              onCancel={(id) => {
                void getPreviewPublisher(wsId).cancel(id);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
