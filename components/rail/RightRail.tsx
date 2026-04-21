'use client';

import { Activity, Eye, GitBranch, Radio, type LucideIcon } from 'lucide-react';
import { RailProvider, useRail } from './RailContext';
import { RailSection } from './RailSection';
import { cn } from '@/lib/utils/cn';

type SectionSpec = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary?: string;
  hasContent?: boolean;
  body: React.ReactNode;
};

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

const RIGHT_SECTIONS: SectionSpec[] = [
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
    summary: 'idle',
    body: <PlaceholderBody hint="typed action log, revert, export manifest" />,
  },
];

function RightRailInner({ className }: { className?: string }) {
  const { railRef } = useRail();
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
      {RIGHT_SECTIONS.map((section) => (
        <RailSection
          key={section.id}
          id={section.id}
          label={section.label}
          icon={section.icon}
          summary={section.summary}
          hasContent={section.hasContent}
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
