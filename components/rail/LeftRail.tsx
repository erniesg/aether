'use client';

import {
  Bookmark,
  FolderKanban,
  Layers3,
  PaintBucket,
  Package,
  PencilLine,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
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

/**
 * Lifecycle-ordered input rail. Hard rule: sources → references → clusters →
 * input sets → brand → product → brief → output targets. Nothing else goes
 * into the left rail — no tools, no navigation, no output, no metadata.
 */
function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

const LEFT_SECTIONS: SectionSpec[] = [
  {
    id: 'sources',
    label: 'sources',
    icon: Bookmark,
    summary: '0 ingested',
    body: <PlaceholderBody hint="drop a url, upload, or repo" />,
  },
  {
    id: 'references',
    label: 'references',
    icon: Layers3,
    summary: '0 pinned',
    body: <PlaceholderBody hint="curated refs land here" />,
  },
  {
    id: 'clusters',
    label: 'clusters',
    icon: FolderKanban,
    summary: 'none',
    body: <PlaceholderBody hint="group refs into reusable signal" />,
  },
  {
    id: 'input-set',
    label: 'input set',
    icon: Sparkles,
    summary: 'empty',
    hasContent: false,
    body: <PlaceholderBody hint="active input set drives the composer" />,
  },
  {
    id: 'brand',
    label: 'brand',
    icon: PaintBucket,
    summary: 'undefined',
    body: <PlaceholderBody hint="palette, type, voice" />,
  },
  {
    id: 'product',
    label: 'product',
    icon: Package,
    summary: 'undefined',
    body: <PlaceholderBody hint="claims, hero assets" />,
  },
  {
    id: 'brief',
    label: 'brief',
    icon: PencilLine,
    summary: 'undefined',
    body: <PlaceholderBody hint="audience, cta, channel, locale" />,
  },
  {
    id: 'targets',
    label: 'output targets',
    icon: Target,
    summary: '0 formats',
    body: <PlaceholderBody hint="platforms, formats, safe zones" />,
  },
];

function LeftRailInner({ className }: { className?: string }) {
  const { railRef } = useRail();
  return (
    <nav
      ref={railRef as React.RefObject<HTMLElement>}
      aria-label="inputs"
      data-taxonomy="input"
      className={cn(
        'relative flex w-rail-compact shrink-0 flex-col items-center gap-0.5 border-r border-border-soft bg-surface-panel-muted py-2',
        className
      )}
    >
      {LEFT_SECTIONS.map((section) => (
        <RailSection
          key={section.id}
          id={section.id}
          label={section.label}
          icon={section.icon}
          summary={section.summary}
          hasContent={section.hasContent}
        >
          {section.body}
        </RailSection>
      ))}
    </nav>
  );
}

export function LeftRail({ className }: { className?: string }) {
  return (
    <RailProvider>
      <LeftRailInner className={className} />
    </RailProvider>
  );
}
