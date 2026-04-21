'use client';

import { useRef } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LeftRail } from '@/components/rail/LeftRail';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasSubstrate } from '@/components/canvas/CanvasSubstrate';
import { PromptComposer } from '@/components/composer/PromptComposer';

export interface WorkspaceShellProps {
  wsId: string;
}

/**
 * The synthesis shell — single route, lens-switched (Phase 3+), strict taxonomy.
 *   header  → navigation + metadata chips
 *   aside#L → input
 *   section → tool (canvas substrate + floating toolbar)
 *   aside#R → output + metadata
 *   footer  → tool (prompt composer)
 *
 * No category leaks anywhere. Panels do not share categories. Do not mix.
 */
export function WorkspaceShell({ wsId }: WorkspaceShellProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Pinned capabilities will come from Convex (Phase 5); empty for now.
  const pinnedCapabilities: Array<{ id: string; label: string }> = [];

  const handlePrompt = async (_prompt: string) => {
    // Phase 4 hooks the Claude agent loop in here.
    // For now the composer clears and we can observe the submit event in tests.
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-bg">
      {/* header — navigation + passive metadata only */}
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
        activeInputSet="empty"
        onSubmit={handlePrompt}
        className="h-composer"
      />
    </div>
  );
}
