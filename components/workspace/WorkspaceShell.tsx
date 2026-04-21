'use client';

import { useCallback, useRef } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import { PromptComposer } from '@/components/composer/PromptComposer';
import { EditorRefProvider, useEditorRef } from '@/lib/store/editor-ref';
import { dropImageOnCanvas } from '@/lib/canvas/dropImage';
import { finishRun, failRun, startRun } from '@/lib/store/runs';

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

  const pinnedCapabilities: Array<{ id: string; label: string }> = [];

  const handlePrompt = useCallback(
    async (prompt: string) => {
      const runId = startRun({
        tool: 'image-gen',
        provider: 'auto',
        model: '',
        prompt,
      });

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const providerOverride = urlParams.get('provider') ?? undefined;
        const modelOverride = urlParams.get('model') ?? undefined;

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, providerId: providerOverride, model: modelOverride }),
        });
        const json = (await res.json()) as any;
        if (!res.ok || !json.ok) {
          const msg = typeof json?.error === 'string' ? json.error : res.statusText;
          failRun(runId, msg);
          return;
        }

        const first = json.result?.images?.[0];
        if (first && editor) {
          dropImageOnCanvas(editor, {
            url: first.url,
            width: first.width,
            height: first.height,
            mimeType: first.mimeType,
            label: json.plan?.rewrittenPrompt ?? prompt,
          });
        }

        finishRun(runId, {
          provider: json.provider?.id ?? 'unknown',
          model: json.provider?.model ?? '',
          rewrittenPrompt: json.plan?.rewrittenPrompt,
          rationale: json.plan?.rationale,
          aspectRatio: json.plan?.aspectRatio,
          imageUrl: first?.url,
          latencyMs: json.result?.latencyMs,
        });
      } catch (err) {
        failRun(runId, err instanceof Error ? err.message : String(err));
      }
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
      </div>

      <PromptComposer
        ref={composerRef}
        onSubmit={handlePrompt}
        inputCount={0}
        className="h-composer"
      />
    </div>
  );
}
