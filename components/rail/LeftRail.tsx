'use client';

import { useState } from 'react';
import {
  Flag,
  Layers3,
  Package2,
  PaintBucket,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { RailProvider, useRail } from './RailContext';
import { RailSection } from './RailSection';
import { BrandSection, brandSectionSummary } from './sections/BrandSection';
import {
  DEMO_CREATOR_CONTEXT,
  summarizeInputSet,
  type SignalContext,
} from '@/lib/context/model';
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

const CONTEXT = DEMO_CREATOR_CONTEXT;

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

function CampaignBody() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">goal</span>
        <textarea
          defaultValue={CONTEXT.campaign.goal}
          rows={3}
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">audience</span>
        <span className="font-caption text-xs text-ink">{CONTEXT.campaign.audience}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">channels</span>
        <div className="flex flex-wrap gap-1">
          {CONTEXT.campaign.channels.map((channel) => (
            <span
              key={channel}
              className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim"
            >
              {channel}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">cta</span>
        <span className="font-caption text-xs text-ink">{CONTEXT.campaign.cta}</span>
      </div>
      <div className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2">
        <span className="font-caption text-ink-dim">active input set</span>
        <p className="mt-1 font-caption text-xs text-ink">{summarizeInputSet(CONTEXT)}</p>
      </div>
    </div>
  );
}

function OfferBody() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">offer</span>
        <span className="font-display text-sm text-ink">{CONTEXT.offer.name}</span>
        <span className="font-caption text-xs text-ink-dim">{CONTEXT.offer.summary}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">claims</span>
        <div className="flex flex-wrap gap-1">
          {CONTEXT.offer.claims.map((claim) => (
            <span
              key={claim}
              className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-caption text-xs text-ink"
            >
              {claim}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">hero asset</span>
        <span className="font-caption text-xs text-ink">{CONTEXT.offer.heroAsset}</span>
      </div>
    </div>
  );
}


function ReferencesBody() {
  const [tab, setTab] = useState<ReferencesTabId>('images');
  const tabs: Array<{ id: ReferencesTabId; label: string }> = [
    { id: 'images', label: 'images' },
    { id: 'templates', label: 'templates' },
    { id: 'elements', label: 'elements' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="references" className="flex items-center gap-0.5">
        {tabs.map((tabSpec) => {
          const active = tabSpec.id === tab;
          return (
            <button
              key={tabSpec.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(tabSpec.id)}
              className={cn(
                'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
              )}
            >
              {tabSpec.label}
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

type SignalSeed = SignalContext;

const SEED_SIGNALS: ReadonlyArray<SignalSeed> = CONTEXT.signals;

function SignalsBody() {
  return (
    <ul className="flex flex-col gap-2">
      {SEED_SIGNALS.map((signal) => (
        <li
          key={signal.id}
          className="flex items-center justify-between gap-3 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <div className="flex flex-col">
            <span className="font-caption text-ink">{signal.title}</span>
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              {signal.platform} · {signal.lift}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The creator context rail separates what changes rarely from what changes
 * per campaign and per run: brand knowledge, offer facts, the active campaign,
 * pinned references, and live signals. The prompt composer remains the canvas
 * form of the current input set, so we keep that concept out of the rail.
 */
const LEFT_SECTIONS: ReadonlyArray<SectionSpec> = [
  {
    id: 'brand',
    label: 'brand',
    icon: PaintBucket,
    summary: brandSectionSummary(CONTEXT.brand),
    hasContent: true,
    body: <BrandSection />,
  },
  {
    id: 'offer',
    label: 'offer',
    icon: Package2,
    summary: `${CONTEXT.offer.claims.length} claims`,
    hasContent: true,
    body: <OfferBody />,
  },
  {
    id: 'campaign',
    label: 'campaign',
    icon: Flag,
    summary: `${CONTEXT.campaign.channels.length} channels`,
    hasContent: true,
    body: <CampaignBody />,
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
    summary: `${SEED_SIGNALS.length} live`,
    hasContent: true,
    body: <SignalsBody />,
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
