'use client';

import { useCallback, useRef } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import { PromptComposer } from '@/components/composer/PromptComposer';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { finishRun, failRun, startRun, stepRun } from '@/lib/store/runs';

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

const EMPTY_PINS: ReadonlyArray<{ id: string; label: string }> = [];

function WorkspaceShellInner({ wsId }: { wsId: string }) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const { editor } = useEditorRef();

  const pinnedCapabilities = EMPTY_PINS;

  const handlePrompt = useCallback(
    async (prompt: string) => {
      log('onSubmit fired · prompt:', prompt);
      const runId = startRun({ tool: 'image-gen', provider: 'auto', model: '', prompt });
      log('run started · id:', runId);
      stepRun(runId, 'prepared');

      const urlParams = new URLSearchParams(window.location.search);
      const providerOverride = urlParams.get('provider') ?? undefined;
      const modelOverride = urlParams.get('model') ?? undefined;
      log('config · provider:', providerOverride ?? '(default)', '· model:', modelOverride ?? '(default)', '· editor ready:', Boolean(editor));

      let res: Response;
      try {
        stepRun(runId, 'sending');
        log('fetch POST /api/generate');
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, providerId: providerOverride, model: modelOverride }),
        });
        stepRun(runId, 'received');
        log('response · status:', res.status, res.statusText);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('fetch threw:', err);
        failRun(runId, `fetch failed: ${message}`);
        return;
      }

      stepRun(runId, 'parsing');
      let json: any;
      try {
        json = await res.json();
        log('response body parsed:', json);
      } catch (err) {
        logError('json parse failed:', err);
        failRun(runId, `bad JSON response (${res.status})`, res.status);
        return;
      }

      if (!res.ok || !json.ok) {
        const msg = typeof json?.error === 'string' ? json.error : res.statusText || 'unknown error';
        logError('api returned not-ok:', msg);
        failRun(runId, msg, res.status);
        return;
      }

      const first = json.result?.images?.[0];
      log('got image · width:', first?.width, 'height:', first?.height, 'urlPrefix:', (first?.url ?? '').slice(0, 60));

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
          log('image placed on canvas');
        } catch (err) {
          logError('dropImageOnCanvas threw:', err);
          failRun(runId, `canvas drop failed: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      } else if (!editor) {
        logError('editor is null at result time — tldraw not mounted yet');
        // Still mark the run as ok; record the image for later, but warn user.
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
      log('run complete');
    },
    [editor]
  );

  return (
    <div className="flex min-h-screen flex-col bg-surface-bg">
      <Surface
        as="header"
        tone="panel"
        taxonomy="navigation"
        border="soft"
        className="flex h-header items-center justify-between px-4"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-base tracking-tight">aether</span>
          <span className="text-ink-faint" aria-hidden>
            /
          </span>
          <span className="font-caption text-ink-dim">workspace · {wsId}</span>
        </div>
        <div className="flex items-center gap-2" data-taxonomy="metadata">
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
        <CanvasSubstrate composerRef={composerRef} pinnedCapabilities={pinnedCapabilities} />
        <RightRail />
        {/* canvas render is isolated from editor changes via memo — placement
            next to rails is intentional so rails' RailProviders keep their
            own scope and can't accidentally remount tldraw. */}
      </div>

      <PromptComposer
        ref={composerRef}
        onSubmit={handlePrompt}
        inputCount={0}
        className="h-composer"
      />
      <ComposerStatus />
    </div>
  );
}
