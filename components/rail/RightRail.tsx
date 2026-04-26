'use client';

import {
  Calendar,
  Columns3,
  Download,
  Eye,
  LayoutGrid,
  Radio,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { RailProvider, useRail } from './RailContext';
import { RailSection } from './RailSection';
import { ActionLog } from './ActionLog';
import {
  PublishSection,
  publishSectionSummary,
} from './sections/PublishSection';
import {
  AutoModePanel,
  type AutoModeCampaignView,
  type AutoModeVariationView,
} from './sections/AutoModePanel';
import { useScheduledPosts } from '@/lib/publisher/store';
import { useRuns, type CapabilityRunRecord } from '@/lib/store/runs';
import {
  useEyesClosedCapture,
  type EyesClosedCapture,
} from '@/lib/voice/eyes-closed-store';
import { setFocusedClusterCard, useFocusedClusterCard } from '@/lib/clusters/focus';
import {
  moveClusterCard,
  useClusters,
  type ClusterCard,
} from '@/lib/clusters/store';
import {
  DEMO_LOCALES,
  setActiveLocale,
  useActiveLocale,
} from '@/lib/text-overlay/active-locale';
import type { BCP47LocaleCode } from '@/lib/text-overlay/types';
import { cn } from '@/lib/utils/cn';
import { useDemoMode } from '@/lib/demo/context';

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  'zh-Hans': '中文',
  'ja-JP': '日本語',
};

type SectionSpec = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary?: string;
  hasContent?: boolean;
  active?: boolean;
  body: React.ReactNode;
  headerAction?: React.ReactNode;
};

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

/**
 * The "This focus" flyout: version tree + Script subsection + the eyes-closed
 * capture provenance (issue #128). The version tree is a stub today — the
 * creator loop hasn't yet produced v1→vN, but the affordance needs to exist
 * so the progressive-disclosure contract holds from first paint. Script is
 * the caption / voiceover / copy per format — the script beat of "idea →
 * picture → script" lives here. The eyes-closed block surfaces the most
 * recent voice transcript + sketch thumbnail + planner output as typed
 * provenance for the active capture.
 */
function LocaleSwitcher() {
  const active = useActiveLocale();
  return (
    <section
      className="flex flex-col gap-1.5"
      aria-label="locale"
      data-testid="focus-locale-switcher"
    >
      <span className="font-caption text-ink-dim">locale</span>
      <div className="flex flex-wrap gap-1">
        {DEMO_LOCALES.map((locale) => {
          const isActive = locale === active;
          return (
            <button
              key={locale}
              type="button"
              data-testid={`locale-switch-${locale}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => setActiveLocale(locale as BCP47LocaleCode)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-sm border px-2 font-mono text-2xs uppercase tracking-wide transition-colors',
                isActive
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel text-ink hover:border-border'
              )}
            >
              {LOCALE_LABELS[locale] ?? locale}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FocusBody() {
  const eyesClosed = useEyesClosedCapture();
  return (
    <div className="flex flex-col gap-4">
      {eyesClosed ? <EyesClosedFocusBlock capture={eyesClosed} /> : null}

      <section className="flex flex-col gap-1.5" aria-label="version tree">
        <span className="font-caption text-ink-dim">versions</span>
        <ol className="flex flex-col gap-1">
          <li className="flex items-center gap-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5">
            <span className="font-mono text-2xs uppercase tracking-wide text-accent">v1</span>
            <span className="truncate font-caption text-ink">
              select an artboard to branch
            </span>
          </li>
        </ol>
      </section>

      <LocaleSwitcher />

      <section className="flex flex-col gap-1.5" aria-label="script">
        <span className="font-caption text-ink-dim">script</span>
        <PlaceholderBody hint="caption · voiceover · copy per format" />
      </section>
    </div>
  );
}

function EyesClosedFocusBlock({ capture }: { capture: EyesClosedCapture }) {
  const transcript = capture.transcript || '— no spoken intent —';
  const moodKeywords = capture.component?.mood?.keywords ?? [];
  const heroDesc = capture.component?.hero?.description;
  const plannerLabel =
    capture.plannerMode === 'pending'
      ? 'planning…'
      : capture.plannerMode === 'anthropic'
      ? 'opus 4.7'
      : capture.plannerMode === 'fallback'
      ? 'fallback'
      : 'error';
  return (
    <section
      className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel-muted p-2"
      aria-label="eyes-closed capture"
      data-testid="eyes-closed-focus"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-caption text-ink-dim">eyes-closed capture</span>
        <span
          className="font-mono text-2xs uppercase tracking-wide text-accent"
          data-testid="eyes-closed-planner-mode"
        >
          {plannerLabel}
        </span>
      </header>

      <div className="flex gap-2">
        {capture.sketchImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capture.sketchImageUrl}
            alt="captured sketch"
            data-testid="eyes-closed-sketch"
            className="h-16 w-16 shrink-0 rounded-xs border border-border-soft bg-surface-panel object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xs border border-dashed border-border-soft">
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
              voice-only
            </span>
          </div>
        )}
        <p
          data-testid="eyes-closed-transcript"
          className="flex-1 break-words font-caption text-ink"
        >
          {transcript}
        </p>
      </div>

      {heroDesc ? (
        <div className="flex flex-col gap-1" aria-label="planner output">
          <span className="font-caption text-ink-dim">hero</span>
          <span
            data-testid="eyes-closed-hero"
            className="font-caption text-xs text-ink"
          >
            {heroDesc}
          </span>
          {moodKeywords.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {moodKeywords.slice(0, 6).map((kw) => (
                <li
                  key={kw}
                  className="rounded-pill border border-border-soft bg-surface-panel px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim"
                >
                  {kw}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {capture.plannerError ? (
        <span className="font-caption text-2xs text-ink-faint">
          planner: {capture.plannerError}
        </span>
      ) : null}
    </section>
  );
}

function FormatsBody({ safeZonesVisible }: { safeZonesVisible: boolean }) {
  // Four seeded artboards align with lib/canvas/seedArtboards. Kept in sync by
  // eye today — a follow-up slice binds this to the editor's frame shapes.
  const FORMATS = [
    'IG Post · 1080×1350',
    'Story · 1080×1920',
    'Reel cover · 1080×1920',
    'LinkedIn · 1200×627',
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="font-caption text-ink-dim">
        safe zones {safeZonesVisible ? 'on' : 'off'} · one hero fans out
      </span>
      <ul className="grid grid-cols-2 gap-2">
        {FORMATS.map((name) => (
          <li
            key={name}
            className="flex h-20 flex-col justify-between rounded-sm border border-dashed border-border-soft bg-surface-panel-muted p-2"
          >
            <span className="font-caption text-ink">{name.split(' · ')[0]}</span>
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              {name.split(' · ')[1]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useGenerationsSummary(): {
  summary: string;
  hasContent: boolean;
  active: boolean;
} {
  const runs = useRuns();
  if (runs.length === 0) return { summary: 'empty', hasContent: false, active: false };
  const running = runs.some((r) => r.status === 'running');
  return {
    summary: running ? 'generating' : `${runs.length} run${runs.length === 1 ? '' : 's'}`,
    hasContent: true,
    active: running,
  };
}

/**
 * Right-rail focus panel for a selected cluster card. Rendered only when the
 * kanban lens has a focused card (hard rule #3 — output + metadata lives on
 * the right). Shows full-sized preview, attribution, cluster it belongs to,
 * and a "promote to input set" affordance that moves the card to Shortlisted.
 */
function ClusterFocusBody({ card, siblings }: { card: ClusterCard; siblings: ClusterCard[] }) {
  const author = card.attribution.author;
  const attribution = author
    ? `${card.attribution.source} · ${author}`
    : card.attribution.source;
  return (
    <div className="flex flex-col gap-3" data-testid="cluster-focus">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.thumbnailUrl}
        alt={attribution}
        className="h-44 w-full rounded-xs border border-border-soft object-cover"
      />
      <section className="flex flex-col gap-1.5" aria-label="attribution">
        <span className="font-caption text-ink-dim">attribution</span>
        <a
          href={card.attribution.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-caption text-xs text-ink hover:text-accent"
          title={card.attribution.url}
        >
          {attribution}
        </a>
      </section>
      <section className="flex flex-col gap-1.5" aria-label="direction">
        <span className="font-caption text-ink-dim">direction</span>
        <span className="font-mono text-2xs uppercase tracking-wide text-ink">
          {card.clusterLabel}
        </span>
      </section>
      <section className="flex flex-col gap-1.5" aria-label="state">
        <span className="font-caption text-ink-dim">state</span>
        <span className="font-mono text-2xs uppercase tracking-wide text-ink">
          {card.column}
        </span>
      </section>
      {siblings.length > 0 ? (
        <section className="flex flex-col gap-1.5" aria-label="siblings">
          <span className="font-caption text-ink-dim">siblings in cluster</span>
          <ul className="grid grid-cols-3 gap-1" data-testid="cluster-focus-siblings">
            {siblings.map((sibling) => (
              <li
                key={sibling.referenceId}
                className="overflow-hidden rounded-xs border border-border-soft"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sibling.thumbnailUrl}
                  alt={sibling.attribution.source}
                  className="h-10 w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="cluster-focus-promote"
          onClick={() => {
            const updated = moveClusterCard(card.referenceId, 'Shortlisted');
            if (updated) {
              setFocusedClusterCard({
                ...card,
                column: 'Shortlisted',
                movedAt: updated.at,
              });
            }
          }}
          disabled={card.column === 'Shortlisted'}
          className={cn(
            'inline-flex h-7 items-center rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink',
            'transition-colors hover:border-accent hover:text-accent',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
        >
          promote to input set
        </button>
        <button
          type="button"
          data-testid="cluster-focus-dismiss"
          onClick={() => setFocusedClusterCard(null)}
          className="inline-flex h-7 items-center font-caption text-ink-dim hover:text-ink"
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

function RightRailInner({
  className,
  onPin,
  onExport,
  exportDisabled,
  safeZonesVisible,
  workspaceId,
  heroMediaUrls,
  onOpenPublishPreview,
  autoModeCampaign,
  autoModeVariations,
  onAutoModeApprove,
  onAutoModeReject,
}: {
  className?: string;
  onPin?: (run: CapabilityRunRecord) => void;
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
  safeZonesVisible: boolean;
  workspaceId: string;
  heroMediaUrls?: string[];
  onOpenPublishPreview?: (postId: string) => void;
  autoModeCampaign?: AutoModeCampaignView | null;
  autoModeVariations?: AutoModeVariationView[];
  onAutoModeApprove?: (variationIndex: number, notifyMode: 'review' | 'auto-post') => Promise<void>;
  onAutoModeReject?: (variationIndex: number) => Promise<void>;
}) {
  const { railRef, openSection, toggle } = useRail();
  const gens = useGenerationsSummary();
  const scheduledPosts = useScheduledPosts(workspaceId);
  const focusedCard = useFocusedClusterCard();
  const eyesClosed = useEyesClosedCapture();
  useEffect(() => {
    // Auto-open the focus section whenever a fresh eyes-closed capture lands
    // so the creator sees provenance without having to click into the rail.
    if (eyesClosed && openSection !== 'focus') {
      toggle('focus');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyesClosed?.id]);
  useEffect(() => {
    // Auto-open the cluster-focus section whenever a new card gets focus.
    // Closing the section is a creator choice; we don't force-close on
    // unfocus so the layout stays stable.
    if (focusedCard && openSection !== 'cluster-focus') {
      toggle('cluster-focus');
    }
    // openSection intentionally excluded — we react to focus changes only,
    // not to rail toggles that happen for other reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCard?.referenceId]);
  const allClusterCards = useClusters();
  const clusterSiblings = focusedCard
    ? allClusterCards
        .filter(
          (c) =>
            c.clusterId === focusedCard.clusterId &&
            c.referenceId !== focusedCard.referenceId
        )
        .slice(0, 6)
    : [];

  const exportAction = onExport ? (
    <button
      type="button"
      onClick={() => {
        void onExport();
      }}
      disabled={exportDisabled}
      aria-label="export"
      title="export pack · PNGs + manifest.json"
      data-testid="rail-export-button"
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink',
        'transition-colors duration-fast ease-quick hover:border-border hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-40'
      )}
    >
      <Download size={10} strokeWidth={2} />
      export
    </button>
  ) : null;

  const autoModeSectionSummary = autoModeCampaign
    ? autoModeCampaign.status === 'running'
      ? 'lap · running'
      : `${autoModeVariations?.filter((v) => v.status === 'ready').length ?? 0} ready`
    : 'idle';

  const sections: SectionSpec[] = [
    ...(focusedCard
      ? [
          {
            id: 'cluster-focus',
            label: 'cluster card',
            icon: Columns3,
            summary: focusedCard.clusterLabel,
            hasContent: true,
            active: true,
            body: <ClusterFocusBody card={focusedCard} siblings={clusterSiblings} />,
          } as SectionSpec,
        ]
      : []),
    {
      id: 'auto-mode',
      label: 'auto mode',
      icon: Zap,
      summary: autoModeSectionSummary,
      hasContent: Boolean(autoModeCampaign),
      active: autoModeCampaign?.status === 'running',
      body: (
        <AutoModePanel
          campaign={autoModeCampaign ?? null}
          variations={autoModeVariations ?? []}
          onApprove={onAutoModeApprove}
          onReject={onAutoModeReject}
        />
      ),
    },
    {
      id: 'focus',
      label: 'this focus',
      icon: Eye,
      summary: eyesClosed
        ? eyesClosed.plannerMode === 'pending'
          ? 'eyes-closed · planning'
          : 'eyes-closed capture'
        : 'nothing selected',
      hasContent: Boolean(eyesClosed),
      active: Boolean(eyesClosed),
      body: <FocusBody />,
      headerAction: exportAction,
    },
    {
      id: 'formats',
      label: 'formats',
      icon: LayoutGrid,
      summary: '4 targets',
      hasContent: true,
      body: <FormatsBody safeZonesVisible={safeZonesVisible} />,
    },
    {
      id: 'all-generations',
      label: 'all generations',
      icon: Radio,
      summary: gens.summary,
      hasContent: gens.hasContent,
      active: gens.active,
      body: <ActionLog onPin={onPin} />,
    },
    {
      id: 'scheduled',
      label: 'publish',
      icon: Calendar,
      summary: publishSectionSummary(scheduledPosts.length),
      hasContent: scheduledPosts.length > 0,
      body: (
        <PublishSection
          workspaceId={workspaceId}
          heroMediaUrls={heroMediaUrls}
          onOpenPreview={onOpenPublishPreview}
        />
      ),
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
          headerAction={section.headerAction}
        >
          {section.body}
        </RailSection>
      ))}
    </nav>
  );
}

export interface RightRailProps {
  className?: string;
  onPin?: (run: CapabilityRunRecord) => void;
  /** Invoked when the creator hits the `export` header action on `this focus`. */
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
  safeZonesVisible?: boolean;
  /** Defaults to 'demo-ws' so legacy renders without a wsId still work — the
   * workspace shell always threads the real id through. */
  workspaceId?: string;
  /** Hero media URLs from the current export pack, threaded into the publish
   * lens. Empty when nothing has been generated — the lens falls back to a
   * 1x1 placeholder so the flow still works for demo. */
  heroMediaUrls?: string[];
  onOpenPublishPreview?: (postId: string) => void;
  /** Auto-Mode lap that is currently in-flight or most recently completed. */
  autoModeCampaign?: AutoModeCampaignView | null;
  autoModeVariations?: AutoModeVariationView[];
  onAutoModeApprove?: (variationIndex: number, notifyMode: 'review' | 'auto-post') => Promise<void>;
  onAutoModeReject?: (variationIndex: number) => Promise<void>;
}

export function RightRail({
  className,
  onPin,
  onExport,
  exportDisabled,
  safeZonesVisible = true,
  workspaceId = 'demo-ws',
  heroMediaUrls,
  onOpenPublishPreview,
  autoModeCampaign,
  autoModeVariations,
  onAutoModeApprove,
  onAutoModeReject,
}: RightRailProps) {
  // Demo mode: override the live lap with the cached fixture.
  // Read-only — approve/reject callbacks are suppressed in demo mode.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const demo = useDemoMode();
  const effectiveCampaign = demo.active && demo.lap ? demo.lap.campaign : autoModeCampaign;
  const effectiveVariations =
    demo.active && demo.lap ? demo.lap.variations : autoModeVariations;

  return (
    <RailProvider>
      <RightRailInner
        className={className}
        onPin={onPin}
        onExport={onExport}
        exportDisabled={exportDisabled}
        safeZonesVisible={safeZonesVisible}
        workspaceId={workspaceId}
        heroMediaUrls={heroMediaUrls}
        onOpenPublishPreview={onOpenPublishPreview}
        autoModeCampaign={effectiveCampaign}
        autoModeVariations={effectiveVariations}
        // In demo mode, suppress mutating callbacks so the canvas stays read-only.
        onAutoModeApprove={demo.active ? undefined : onAutoModeApprove}
        onAutoModeReject={demo.active ? undefined : onAutoModeReject}
      />
    </RailProvider>
  );
}
