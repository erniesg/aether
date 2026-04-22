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
import { dispatchFanOut, dropImageInFrame, pickAspectRatio } from '@/lib/canvas/fanOut';
import type { AspectRatio } from '@/lib/providers/image/types';
import {
  finishRun,
  failRun,
  startRun,
  stepRun,
  type CapabilityRunRecord,
} from '@/lib/store/runs';
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

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const { editor } = useEditorRef();
  const definitions = useCapabilityDefinitions();
  const [pinTargetRun, setPinTargetRun] = useState<CapabilityRunRecord | null>(null);
  const [view, setView] = useState<ViewId>('canvas');
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
        /** Prompt actually sent to the API. Defaults to `prompt`, but fan-out
         * reuses a shared rewritten prompt while preserving the creator's
         * original prompt in the run log. */
        requestPrompt?: string;
        /** Optional per-request aspect ratio (fan-out path sets one per frame). */
        aspectRatio?: AspectRatio;
        /** When set, place the resulting image inside this tldraw frame instead
         * of centring it on the current viewport. */
        targetFrameId?: string;
      } = {}
    ): Promise<GenerateResponseJson | null> => {
      const requestPrompt = options.requestPrompt ?? prompt;
      const runId = startRun({
        tool: 'image-gen',
        provider: options.providerOverride ?? 'auto',
        model: options.modelOverride ?? '',
        prompt,
        definitionId: options.definitionId,
      });
      stepRun(runId, 'prepared');

      let res: Response;
      try {
        stepRun(runId, 'sending');
        if (options.definitionId) {
          const def = getDefinitionById(options.definitionId);
          if (!def) {
            failRun(runId, `unknown capability definition: ${options.definitionId}`);
            return null;
          }
          res = await fetch('/api/capability/rerun', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              definition: def,
              promptOverride: prompt,
              runId,
            }),
          });
        } else {
          res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: requestPrompt,
              providerId: options.providerOverride,
              model: options.modelOverride,
              bypassAgent: options.bypassAgent,
              refs: options.refs?.map((url) => ({ url })),
              aspectRatio: options.aspectRatio,
              runId,
            }),
          });
        }
        stepRun(runId, 'received');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('fetch threw:', err);
        failRun(runId, `fetch failed: ${message}`);
        return null;
      }

      stepRun(runId, 'parsing');
      let json: GenerateResponseJson;
      try {
        json = await res.json();
      } catch (err) {
        logError('json parse failed:', err);
        failRun(runId, `bad JSON response (${res.status})`, res.status);
        return null;
      }

      if (!res.ok || !json.ok) {
        const msg = typeof json?.error === 'string' ? json.error : res.statusText || 'unknown error';
        failRun(runId, msg, res.status);
        return null;
      }

      const first = json.result?.images?.[0];
      stepRun(runId, 'placing');
      if (first && editor) {
        try {
          const label = json.plan?.rewrittenPrompt ?? requestPrompt;
          if (options.targetFrameId) {
            const placed = dropImageInFrame(editor, options.targetFrameId, {
              url: first.url,
              width: first.width,
              height: first.height,
              mimeType: first.mimeType,
              label,
            });
            if (!placed) throw new Error('target frame missing');
          } else {
            dropImageOnCanvas(editor, {
              url: first.url,
              width: first.width,
              height: first.height,
              mimeType: first.mimeType,
              label,
            });
          }
        } catch (err) {
          failRun(runId, `canvas drop failed: ${err instanceof Error ? err.message : String(err)}`);
          return null;
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
      return json;
    },
    [editor]
  );

  const requestGenerationPlan = useCallback(
    async (
      prompt: string,
      options: {
        providerOverride?: string;
        modelOverride?: string;
        bypassAgent?: boolean;
        refs?: string[];
      } = {}
    ): Promise<GenerateResponseJson | null> => {
      let res: Response;
      try {
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            providerId: options.providerOverride,
            model: options.modelOverride,
            bypassAgent: options.bypassAgent,
            refs: options.refs?.map((url) => ({ url })),
            planOnly: true,
          }),
        });
      } catch (err) {
        logError('plan fetch threw:', err);
        return null;
      }

      let json: GenerateResponseJson;
      try {
        json = await res.json();
      } catch (err) {
        logError('plan json parse failed:', err);
        return null;
      }

      if (!res.ok || !json.ok) {
        logError('plan request failed:', json.error ?? (res.statusText || 'unknown error'));
        return null;
      }

      return json;
    },
    []
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

      // scope='all' fans out: one generation per frame, each rendered at the
      // frame's own aspect ratio and dropped inside it. The agent plans the
      // prompt once (or it's piped through when bypassing) and the provider
      // is called once per frame — shared Claude rewrite, per-frame shape.
      if (options.scope === 'all' && editor) {
        const frames = getFrameShapes(editor);
        if (frames.length > 0) {
          const targets = frames.map((f) => {
            const props = (f as unknown as { props: { w: number; h: number } }).props;
            return { id: f.id, w: props.w, h: props.h };
          });
          log('fan-out · frames:', targets.length);
          const planned = await requestGenerationPlan(prompt, {
            providerOverride,
            modelOverride,
            bypassAgent,
            refs: options.refs,
          });
          if (planned?.plan?.rewrittenPrompt) {
            const sharedPrompt = planned.plan.rewrittenPrompt;
            const sharedProvider = planned.provider?.id ?? providerOverride;
            const sharedModel = planned.provider?.model ?? modelOverride;
            await dispatchFanOut(targets, async (target, aspectRatio) => {
              await runImageOnCanvas(prompt, {
                requestPrompt: sharedPrompt,
                providerOverride: sharedProvider,
                modelOverride: sharedModel,
                bypassAgent: true,
                refs: options.refs,
                aspectRatio,
                targetFrameId: target.id,
              });
            });
            return;
          }

          logError('fan-out plan unavailable, falling back to per-frame generate');
          await dispatchFanOut(targets, async (target, aspectRatio) => {
            await runImageOnCanvas(prompt, {
              providerOverride,
              modelOverride,
              bypassAgent,
              refs: options.refs,
              aspectRatio,
              targetFrameId: target.id,
            });
          });
          return;
        }
      }

      // scope='single' (or 'all' on an empty canvas): one generation. When the
      // creator is in the focus lens, drop into the currently-focused frame
      // with its own aspect ratio. Otherwise centre on the viewport as before.
      let targetFrameId: string | undefined;
      let aspectRatio: AspectRatio | undefined;
      if (view === 'focus' && editor) {
        const frames = getFrameShapes(editor);
        const target = frames[focusIdx];
        if (target) {
          targetFrameId = target.id;
          const props = (target as unknown as { props: { w: number; h: number } }).props;
          aspectRatio = pickAspectRatio(props.w, props.h);
        }
      }

      await runImageOnCanvas(prompt, {
        providerOverride,
        modelOverride,
        bypassAgent,
        refs: options.refs,
        aspectRatio,
        targetFrameId,
      });
    },
    [runImageOnCanvas, requestGenerationPlan, editor, view, focusIdx]
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
          pinnedCapabilities={pinnedCapabilities}
          onCapabilityPress={handleCapabilityPress}
          onVerbPress={handleVerbPress}
        />
        <RightRail onPin={handlePin} />
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
