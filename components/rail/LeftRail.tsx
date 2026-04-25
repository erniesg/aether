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
import { CampaignSection, campaignSectionSummary } from './sections/CampaignSection';
import { OfferSection, offerSectionSummary } from './sections/OfferSection';
import {
  SignalsSection,
  signalsSectionSummary,
} from './sections/SignalsSection';
import {
  ReferencesImagesTab,
  ReferencesManualTab,
} from './sections/ReferencesImagesTab';
import { useSignals } from '@/lib/signals/store';
import { useReferences, referenceSummary } from '@/lib/references/store';
import { useCreatorContext } from '@/lib/context/creator-store';
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

function ReferencesBody({ workspaceId }: { workspaceId?: string }) {
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
        <ReferencesImagesTab workspaceId={workspaceId} />
      ) : tab === 'templates' ? (
        <ReferencesManualTab kind="template" workspaceId={workspaceId} />
      ) : (
        <ReferencesManualTab kind="element" workspaceId={workspaceId} />
      )}
    </div>
  );
}

/**
 * The creator context rail separates what changes rarely from what changes
 * per campaign and per run: brand knowledge, offer facts, the active campaign,
 * pinned references, and live signals. The prompt composer remains the canvas
 * form of the current input set, so we keep that concept out of the rail.
 */
function LeftRailInner({
  className,
  workspaceId,
}: {
  className?: string;
  workspaceId?: string;
}) {
  const { railRef } = useRail();
  const signals = useSignals(workspaceId);
  const references = useReferences(workspaceId);
  const context = useCreatorContext(workspaceId);
  const signalsSummary = signalsSectionSummary(signals);

  const sections: ReadonlyArray<SectionSpec> = [
    {
      id: 'brand',
      label: 'brand',
      icon: PaintBucket,
      summary: brandSectionSummary(context.brand),
      hasContent: true,
      body: <BrandSection context={context.brand} workspaceId={workspaceId} />,
    },
    {
      id: 'offer',
      label: 'offer',
      icon: Package2,
      summary: offerSectionSummary(context.offer),
      hasContent: true,
      body: <OfferSection workspaceId={workspaceId} />,
    },
    {
      id: 'campaign',
      label: 'campaign',
      icon: Flag,
      summary: campaignSectionSummary(context.campaign),
      hasContent: true,
      body: <CampaignSection workspaceId={workspaceId} />,
    },
    {
      id: 'references',
      label: 'references',
      icon: Layers3,
      summary: referenceSummary(references),
      hasContent: references.length > 0,
      body: <ReferencesBody workspaceId={workspaceId} />,
    },
    {
      id: 'signals',
      label: 'signals',
      icon: TrendingUp,
      summary: signalsSummary,
      hasContent: signals.length > 0,
      body: <SignalsSection workspaceId={workspaceId} />,
    },
  ];

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
      {sections.map((section) => (
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

export function LeftRail({
  className,
  workspaceId,
}: {
  className?: string;
  workspaceId?: string;
}) {
  return (
    <RailProvider>
      <LeftRailInner className={className} workspaceId={workspaceId} />
    </RailProvider>
  );
}
