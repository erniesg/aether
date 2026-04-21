'use client';

import { Activity, Eye, GitBranch, Radio, type LucideIcon } from 'lucide-react';
import { RailProvider, useRail } from './RailContext';
import { RailSection } from './RailSection';
import { ActionLog } from './ActionLog';
import { useRuns } from '@/lib/store/runs';
import { cn } from '@/lib/utils/cn';

type SectionSpec = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary?: string;
  hasContent?: boolean;
  active?: boolean;
  body: React.ReactNode;
};

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

function useSyncSummary(): { summary: string; hasContent: boolean; active: boolean } {
  const runs = useRuns();
  if (runs.length === 0) return { summary: 'idle', hasContent: false, active: false };
  const running = runs.some((r) => r.status === 'running');
  return {
    summary: running ? 'generating' : `${runs.length} run${runs.length === 1 ? '' : 's'}`,
    hasContent: true,
    active: running,
  };
}

function RightRailInner({ className }: { className?: string }) {
  const { railRef } = useRail();
  const sync = useSyncSummary();

  const sections: SectionSpec[] = [
    {
      id: 'focus',
      label: 'focus',
      icon: Eye,
      summary: 'empty',
      body: <PlaceholderBody hint="active key visual or variant set" />,
    },
    {
      id: 'versions',
      label: 'versions',
      icon: GitBranch,
      summary: '0 revisions',
      body: <PlaceholderBody hint="revision history of the focus" />,
    },
    {
      id: 'observations',
      label: 'observations',
      icon: Activity,
      summary: 'none',
      body: <PlaceholderBody hint="agent notes filtered by severity" />,
    },
    {
      id: 'sync',
      label: 'sync · provenance',
      icon: Radio,
      summary: sync.summary,
      hasContent: sync.hasContent,
      active: sync.active,
      body: <ActionLog />,
    },
  ];

  return (
    <nav
      ref={railRef as React.RefObject<HTMLElement>}
      aria-label="outputs"
      data-taxonomy="output"
      className={cn(
        'relative flex w-rail-compact shrink-0 flex-col items-center gap-0.5 border-l border-border-soft bg-surface-panel-muted py-2',
        className
      )}
    >
      {sections.map((section) => (
        <RailSection
          key={section.id}
          id={section.id}
          label={section.label}
          icon={section.icon}
          summary={section.summary}
          hasContent={section.hasContent}
          active={section.active}
          side="left"
        >
          {section.body}
        </RailSection>
      ))}
    </nav>
  );
}

export function RightRail({ className }: { className?: string }) {
  return (
    <RailProvider>
      <RightRailInner className={className} />
    </RailProvider>
  );
}
