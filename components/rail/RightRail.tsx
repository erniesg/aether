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
import {
  PublishSection,
  publishSectionSummary,
} from './sections/PublishSection';
import { useScheduledPosts } from '@/lib/publisher/store';
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

function RightRailInner({
  className,
  onPin,
  onExport,
  exportDisabled,
  safeZonesVisible,
  workspaceId,
  heroMediaUrls,
  onOpenPublishPreview,
}: {
  className?: string;
  onPin?: (run: CapabilityRunRecord) => void;
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
  safeZonesVisible: boolean;
  workspaceId: string;
  heroMediaUrls?: string[];
  onOpenPublishPreview?: (postId: string) => void;
}) {
  const { railRef } = useRail();
  const gens = useGenerationsSummary();
  const scheduledPosts = useScheduledPosts(workspaceId);

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
}: RightRailProps) {
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
      />
    </RailProvider>
  );
}
