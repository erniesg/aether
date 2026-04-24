'use client';

import {
  Calendar,
  Download,
  Eye,
  LayoutGrid,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { RailProvider, useRail } from './RailContext';
import { RailSection } from './RailSection';
import { ActionLog } from './ActionLog';
import { IconButton } from '@/components/ui/IconButton';
import { DEFAULT_ARTBOARDS } from '@/lib/canvas/seedArtboards';
import type { GuardedLayoutPlan } from '@/lib/canvas/layoutGuard';
import {
  buildManagedScheduleDraft,
  formatScheduleTime,
} from '@/lib/workflow/schedule';
import { useRuns, type CapabilityRunRecord } from '@/lib/store/runs';
import { cn } from '@/lib/utils/cn';

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

type RailFormat = { id: string; label?: string };
const ACTIVE_RUN_WINDOW_MS = 30 * 60 * 1000;

function PlaceholderBody({ hint }: { hint: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <span className="font-caption text-ink-dim">{hint}</span>
    </div>
  );
}

/**
 * The "This focus" flyout: version tree + Script subsection. The version tree
 * is a stub today (one seeded row) — the creator loop hasn't yet produced
 * v1→vN, but the affordance needs to exist so the progressive-disclosure
 * contract holds from first paint. Script is the caption / voiceover / copy
 * per format — the script beat of "idea → picture → script" lives here.
 */
function FocusBody() {
  return (
    <div className="flex flex-col gap-4">
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

      <section className="flex flex-col gap-1.5" aria-label="script">
        <span className="font-caption text-ink-dim">script</span>
        <PlaceholderBody hint="caption · voiceover · copy per format" />
      </section>
    </div>
  );
}

function defaultRailFormats(): RailFormat[] {
  return DEFAULT_ARTBOARDS.map((seed) => ({
    id: seed.preset,
    label: seed.name.split(' · ')[0] ?? seed.name,
  }));
}

function FormatsBody({
  safeZonesVisible,
  layoutGuardEnabled,
  layoutPlan,
}: {
  safeZonesVisible: boolean;
  layoutGuardEnabled: boolean;
  layoutPlan?: GuardedLayoutPlan | null;
}) {
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
      <span className="font-caption text-ink-dim">
        layout guard {layoutGuardEnabled ? 'on' : 'off'} ·{' '}
        {layoutPlan
          ? `${layoutPlan.avoidanceRegions.length} protected zones · ${layoutPlan.status}`
          : 'ready for guarded copy'}
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
  hasCompletedOutput: boolean;
} {
  const runs = useRuns();
  if (runs.length === 0) {
    return {
      summary: 'empty',
      hasContent: false,
      active: false,
      hasCompletedOutput: false,
    };
  }
  const running = runs.some(
    (r) => r.status === 'running' && Date.now() - r.startedAt < ACTIVE_RUN_WINDOW_MS
  );
  return {
    summary: running ? 'generating' : `${runs.length} run${runs.length === 1 ? '' : 's'}`,
    hasContent: true,
    active: running,
    hasCompletedOutput: runs.some(
      (run) =>
        run.status === 'ok' &&
        (run.artifactKind === 'image' || run.artifactKind === 'video' || run.imageUrl)
    ),
  };
}

function ScheduledBody({
  formats,
  layoutPlan,
}: {
  formats: ReadonlyArray<RailFormat>;
  layoutPlan?: GuardedLayoutPlan | null;
}) {
  const runs = useRuns();
  const schedule = buildManagedScheduleDraft({
    formats: formats.length > 0 ? formats : defaultRailFormats(),
    runs,
    layoutPlan,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-caption text-ink">validation</span>
          <span
            className={cn(
              'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide',
              schedule.status === 'ready'
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border-soft bg-surface-panel text-ink-dim'
            )}
          >
            {schedule.status}
          </span>
        </div>
        <p className="mt-1 font-caption text-2xs text-ink-dim">
          {schedule.validation.hasOutput ? 'outputs present' : 'needs generated outputs'} ·
          layout {schedule.validation.layoutStatus}
          {schedule.validation.issueCount > 0
            ? ` · ${schedule.validation.issueCount} issue${schedule.validation.issueCount === 1 ? '' : 's'}`
            : ''}
        </p>
      </div>

      <ol className="flex flex-col gap-1.5">
        {schedule.slots.slice(0, 4).map((slot) => (
          <li
            key={slot.id}
            className="flex items-center justify-between gap-3 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
          >
            <div className="min-w-0">
              <span className="block truncate font-caption text-ink">{slot.platform}</span>
              <span className="block truncate font-mono text-2xs uppercase tracking-wide text-ink-dim">
                {slot.format}
              </span>
            </div>
            <span className="shrink-0 font-caption text-2xs text-ink-dim">
              {formatScheduleTime(slot.scheduledFor)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RightRailInner({
  className,
  onPin,
  onExport,
  exportDisabled,
  safeZonesVisible,
  layoutGuardEnabled,
  layoutPlan,
  formats,
}: {
  className?: string;
  onPin?: (run: CapabilityRunRecord) => void;
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
  safeZonesVisible: boolean;
  layoutGuardEnabled: boolean;
  layoutPlan?: GuardedLayoutPlan | null;
  formats: ReadonlyArray<RailFormat>;
}) {
  const { railRef } = useRail();
  const gens = useGenerationsSummary();
  const handleExportClick = () => {
    void onExport?.();
  };

  const exportAction = onExport ? (
    <button
      type="button"
      onClick={handleExportClick}
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

  const sections: SectionSpec[] = [
    {
      id: 'focus',
      label: 'this focus',
      icon: Eye,
      summary: 'nothing selected',
      body: <FocusBody />,
      headerAction: exportAction,
    },
    {
      id: 'formats',
      label: 'formats',
      icon: LayoutGrid,
      summary: '4 targets',
      hasContent: true,
      body: (
        <FormatsBody
          safeZonesVisible={safeZonesVisible}
          layoutGuardEnabled={layoutGuardEnabled}
          layoutPlan={layoutPlan}
        />
      ),
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
      label: 'scheduled',
      icon: Calendar,
      summary:
        layoutPlan?.status === 'ready' && gens.hasCompletedOutput ? 'ready' : 'draft',
      hasContent: true,
      body: <ScheduledBody formats={formats} layoutPlan={layoutPlan} />,
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
      {onExport ? (
        <div className="mt-auto border-t border-border-soft px-1 pt-2">
          <IconButton
            size="md"
            variant="outline"
            label="export pack"
            title="export pack · PNGs + manifest.json"
            data-testid="rail-export-pack-button"
            disabled={exportDisabled}
            icon={<Download size={15} strokeWidth={1.75} />}
            onClick={handleExportClick}
          />
        </div>
      ) : null}
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
  layoutGuardEnabled?: boolean;
  layoutPlan?: GuardedLayoutPlan | null;
  formats?: ReadonlyArray<RailFormat>;
}

export function RightRail({
  className,
  onPin,
  onExport,
  exportDisabled,
  safeZonesVisible = true,
  layoutGuardEnabled = true,
  layoutPlan,
  formats = [],
}: RightRailProps) {
  return (
    <RailProvider>
      <RightRailInner
        className={className}
        onPin={onPin}
        onExport={onExport}
        exportDisabled={exportDisabled}
        safeZonesVisible={safeZonesVisible}
        layoutGuardEnabled={layoutGuardEnabled}
        layoutPlan={layoutPlan}
        formats={formats}
      />
    </RailProvider>
  );
}
