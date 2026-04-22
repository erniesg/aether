'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ViewSwitcher, type ViewId } from '@/components/header/ViewSwitcher';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import { PromptComposer, type ComposerHandle } from '@/components/composer/PromptComposer';
import type { ToolbarVerb } from '@/components/canvas/FloatingToolbar';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { PinDialog, type ProposedCapability } from '@/components/capability/PinDialog';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { DEFAULT_ARTBOARDS } from '@/lib/canvas/seedArtboards';
import {
  focusFrameAtIndex,
  getFrameShapes,
  zoomToAllFrames,
} from '@/lib/canvas/focusFrame';
import { dropImageInFrame, pickAspectRatio } from '@/lib/canvas/fanOut';
import {
  readGenerateStream,
  type GenerateStreamEvent,
} from '@/lib/generate/stream';
import type { AspectRatio } from '@/lib/providers/image/types';
import {
  finishRun,
  failRun,
  startRun,
  stepRun,
  type CapabilityRunRecord,
} from '@/lib/store/runs';
import {
  appendRunActivity,
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

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const { editor } = useEditorRef();
  const definitions = useCapabilityDefinitions();
  const [pinTargetRun, setPinTargetRun] = useState<CapabilityRunRecord | null>(null);
  const [view, setView] = useState<ViewId>('canvas');
  const [safeZonesVisible, setSafeZonesVisible] = useState(true);
  // Focus lens cycles through frames via arrow keys; declared early so fan-out
  // logic in handlePrompt can pick the focused frame for single-scope dispatch.
  const [focusIdx, setFocusIdx] = useState(0);

  const pinnedCapabilities = useMemo(
    () => definitions.map((d) => ({ id: d.id, label: d.name })),
    [definitions]
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

  const handlePrompt = useCallback(
    async (prompt: string, options: { refs?: string[]; scope: 'all' | 'single' }) => {
      log(
        'onSubmit · prompt:',
        prompt,
        'refs:',
        options.refs?.length ?? 0,
        'scope:',
        options.scope
      );
      const urlParams = new URLSearchParams(window.location.search);
      const providerOverride = urlParams.get('provider') ?? undefined;
      const modelOverride = urlParams.get('model') ?? undefined;
      // `?bypass=1` skips the Claude planner and pipes the prompt straight
      // to the provider. Useful when the Anthropic key is rate-limited or
      // out of credits, or to demo the raw provider without Claude's rewrite.
      const bypassAgent = urlParams.get('bypass') === '1';

      if (options.scope === 'all' && editor) {
        const frames = getFrameShapes(editor);
        if (frames.length > 0) {
          const targets = frames.map((f) => {
            const props = (f as unknown as { props: { w: number; h: number; name?: string } }).props;
            return {
              id: f.id,
              label: compactFrameLabel(props.name),
              aspectRatio: pickAspectRatio(props.w, props.h),
            };
          });
          log('fan-out · frames:', targets.length);
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
      // creator is in the focus lens, drop into the currently-focused frame
      // with its own aspect ratio. Otherwise centre on the viewport as before.
      let targets: GenerateTargetSpec[] | undefined;
      if (view === 'focus' && editor) {
        const frames = getFrameShapes(editor);
        const target = frames[focusIdx];
        if (target) {
          const props = (target as unknown as { props: { w: number; h: number; name?: string } }).props;
          targets = [
            {
              id: target.id,
              label: compactFrameLabel(props.name),
              aspectRatio: pickAspectRatio(props.w, props.h),
            },
          ];
        }
      }

      await runImageOnCanvas(prompt, {
        providerOverride,
        modelOverride,
        bypassAgent,
        refs: options.refs,
        targets,
      });
    },
    [runImageOnCanvas, editor, view, focusIdx]
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
          composerRef={composerRef}
          safeZonesVisible={safeZonesVisible}
          onSafeZonesToggle={setSafeZonesVisible}
          pinnedCapabilities={pinnedCapabilities}
          onCapabilityPress={handleCapabilityPress}
          onVerbPress={handleVerbPress}
        />
        <RightRail onPin={handlePin} safeZonesVisible={safeZonesVisible} />
      </div>

      <PromptComposer
        ref={composerRef}
        onSubmit={handlePrompt}
        inputCount={0}
        formatCount={DEFAULT_ARTBOARDS.length}
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
