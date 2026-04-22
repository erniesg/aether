'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ViewSwitcher, type ViewId } from '@/components/header/ViewSwitcher';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import { PromptComposer } from '@/components/composer/PromptComposer';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { PinDialog, type ProposedCapability } from '@/components/capability/PinDialog';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { DEFAULT_ARTBOARDS } from '@/lib/canvas/seedArtboards';
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

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const { editor } = useEditorRef();
  const definitions = useCapabilityDefinitions();
  const [pinTargetRun, setPinTargetRun] = useState<CapabilityRunRecord | null>(null);
  const [view, setView] = useState<ViewId>('canvas');

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
      } = {}
    ) => {
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
            return;
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
              prompt,
              providerId: options.providerOverride,
              model: options.modelOverride,
              bypassAgent: options.bypassAgent,
              refs: options.refs?.map((url) => ({ url })),
              runId,
            }),
          });
        }
        stepRun(runId, 'received');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('fetch threw:', err);
        failRun(runId, `fetch failed: ${message}`);
        return;
      }

      stepRun(runId, 'parsing');
      let json: { ok?: boolean; error?: string; plan?: { rewrittenPrompt?: string; rationale?: string; aspectRatio?: string }; provider?: { id?: string; model?: string }; result?: { latencyMs?: number; images?: Array<{ url: string; width: number; height: number; mimeType: string }> } };
      try {
        json = await res.json();
      } catch (err) {
        logError('json parse failed:', err);
        failRun(runId, `bad JSON response (${res.status})`, res.status);
        return;
      }

      if (!res.ok || !json.ok) {
        const msg = typeof json?.error === 'string' ? json.error : res.statusText || 'unknown error';
        failRun(runId, msg, res.status);
        return;
      }

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
          failRun(runId, `canvas drop failed: ${err instanceof Error ? err.message : String(err)}`);
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
      // Scope is surfaced for future fan-out wiring — today a single
      // generation still resolves to one canvas drop.
      await runImageOnCanvas(prompt, {
        providerOverride,
        modelOverride,
        bypassAgent,
        refs: options.refs,
      });
    },
    [runImageOnCanvas]
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
