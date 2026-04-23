'use client';

import { useState } from 'react';
import {
  Flag,
  Layers3,
  Package2,
  PaintBucket,
  Sparkles,
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
import {
  openCampaignPicker,
  useCampaignPick,
} from '@/lib/campaigns/store';
import { cn } from '@/lib/utils/cn';

type SectionSpec = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary?: string;
  hasContent?: boolean;
  headerAction?: React.ReactNode;
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
  const pick = useCampaignPick();
  const briefValue = pick?.briefBody ?? CONTEXT.campaign.goal;
  const channels = pick?.formats.map((f) => formatChannelLabel(f)) ?? CONTEXT.campaign.channels;
  const toneTokens = pick?.tone ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">brief</span>
        <textarea
          key={pick?.pickedAt ?? 'initial'}
          defaultValue={briefValue}
          data-testid="campaign-brief-textarea"
          rows={4}
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>
      {pick ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">intent</span>
          <span className="font-caption text-xs text-ink">{pick.intent}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">audience</span>
          <span className="font-caption text-xs text-ink">{CONTEXT.campaign.audience}</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">formats</span>
        <div className="flex flex-wrap gap-1" data-testid="campaign-formats">
          {channels.map((channel) => (
            <span
              key={channel}
              className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim"
            >
              {channel}
            </span>
          ))}
        </div>
      </div>
      {toneTokens.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">tone</span>
          <div className="flex flex-wrap gap-1">
            {toneTokens.map((tone) => (
              <span
                key={tone}
                className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-caption text-xs text-ink"
              >
                {tone}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {!pick ? (
        <div className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2">
          <span className="font-caption text-ink-dim">active input set</span>
          <p className="mt-1 font-caption text-xs text-ink">{summarizeInputSet(CONTEXT)}</p>
        </div>
      ) : null}
    </div>
  );
}

const FORMAT_CHANNEL_LABELS: Record<string, string> = {
  'ig-post': 'IG post',
  story: 'story',
  'reel-cover': 'reel cover',
  'linkedin-landscape': 'LinkedIn',
};
function formatChannelLabel(formatId: string): string {
  return FORMAT_CHANNEL_LABELS[formatId] ?? formatId;
}

function CampaignHeaderAction() {
  const { close } = useRail();
  return (
    <button
      type="button"
      data-testid="campaign-pick-open"
      onClick={(event) => {
        event.stopPropagation();
        // Collapse the rail flyout before opening the dialog so the dialog's
        // outside-click doesn't race with the rail's own outside-click
        // detector and close each other.
        close();
        openCampaignPicker();
      }}
      className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-1.5 py-0.5 font-caption text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent"
    >
      <Sparkles size={12} strokeWidth={1.75} />
      pick
    </button>
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
    headerAction: <CampaignHeaderAction />,
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
          headerAction={section.headerAction}
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
