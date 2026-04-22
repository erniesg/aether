'use client';

import { useState } from 'react';
import {
  Layers3,
  PaintBucket,
  PencilLine,
  TrendingUp,
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

type ReferencesTabId = 'images' | 'templates' | 'elements';

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

function BriefBody() {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-caption text-ink-dim">one-line brief</span>
      <textarea
        defaultValue="Launch the spring skincare line with a slow-morning, golden-hour mood."
        rows={3}
        className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <span className="mt-1 font-caption text-ink-dim">audience · channel · cta</span>
      <PlaceholderBody hint="structured fields unlock when the one-liner is pinned" />
    </div>
  );
}

function ReferencesBody() {
  const [tab, setTab] = useState<ReferencesTabId>('images');
  const TABS: Array<{ id: ReferencesTabId; label: string }> = [
    { id: 'images', label: 'images' },
    { id: 'templates', label: 'templates' },
    { id: 'elements', label: 'elements' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="references" className="flex items-center gap-0.5">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'images' ? (
        <PlaceholderBody hint="drop or paste reference images to pin" />
      ) : tab === 'templates' ? (
        <PlaceholderBody hint="starting layouts seed an artboard" />
      ) : (
        <PlaceholderBody hint="stock shapes · icons · stickers" />
      )}
    </div>
  );
}

type SignalSeed = {
  title: string;
  platform: string;
  lift: string;
};

const SEED_SIGNALS: ReadonlyArray<SignalSeed> = [
  { title: 'Clean-girl aesthetic', platform: 'TikTok EU', lift: '+341%' },
  { title: 'Golden-hour product', platform: 'Instagram', lift: '+124%' },
  { title: 'Slow-morning rituals', platform: 'Pinterest', lift: '+89%' },
];

function SignalsBody() {
  return (
    <ul className="flex flex-col gap-2">
      {SEED_SIGNALS.map((s) => (
        <li
          key={s.title}
          className="flex items-center justify-between gap-3 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <div className="flex flex-col">
            <span className="font-caption text-ink">{s.title}</span>
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              {s.platform} · {s.lift}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BrandBody() {
  const PALETTE = ['#0F1013', '#E8E4D6', '#C48B5E', '#7C9885', '#2E4057'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">palette</span>
        <div className="flex gap-1">
          {PALETTE.map((c) => (
            <span
              key={c}
              title={c}
              className="inline-block h-5 w-5 rounded-xs border border-border-soft"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">type</span>
        <span className="font-display text-sm text-ink">Editorial serif</span>
        <span className="font-caption text-xs text-ink-dim">+ mono caption</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">voice</span>
        <span className="font-caption text-xs text-ink">
          slow, certain, more gesture than grammar.
        </span>
      </div>
    </div>
  );
}

/**
 * The four inputs the creator feeds into the canvas before generating:
 * a brief, pinned references (images/templates/elements), trending signals
 * to stay current, and the brand kit. Replaces the old eight operator-shaped
 * sections (sources, clusters, input-set, product, targets — all folded in
 * or deferred). Progressive disclosure: each section is icon + chip in the
 * compact column; body opens on click.
 */
const LEFT_SECTIONS: ReadonlyArray<SectionSpec> = [
  {
    id: 'brief',
    label: 'brief',
    icon: PencilLine,
    summary: '1 line',
    hasContent: true,
    body: <BriefBody />,
  },
  {
    id: 'references',
    label: 'references',
    icon: Layers3,
    summary: '0 pinned',
    body: <ReferencesBody />,
  },
  {
    id: 'signals',
    label: 'signals',
    icon: TrendingUp,
    summary: `${SEED_SIGNALS.length} trending`,
    hasContent: true,
    body: <SignalsBody />,
  },
  {
    id: 'brand',
    label: 'brand kit',
    icon: PaintBucket,
    summary: '5 swatches',
    hasContent: true,
    body: <BrandBody />,
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
