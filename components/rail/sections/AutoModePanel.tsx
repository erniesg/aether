'use client';

import { useCallback, useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { VariationActions } from '@/components/rail/VariationActions';

/**
 * AutoModePanel — right-rail body for the in-flight + most-recent Auto Mode
 * lap. Strict UI taxonomy (CLAUDE.md hard rule #3): the right rail is
 * `output` + `metadata` only. This panel renders:
 *   - the lap status line (running/completed/failed) with timestamps
 *   - one card per variation: hero thumbnail · caption · hashtags ·
 *     mood note · per-locale captions · per-format crops · schedule
 *
 * Per progressive-disclosure (rule #5), each variation card is collapsed
 * into a single line by default; click expands the per-locale + per-format
 * details.
 *
 * Purely view-layer: takes a campaign + variations as props. The parent
 * is responsible for subscribing to `api.campaigns.get` (Convex) and
 * passing the result down. No fetching here.
 *
 * LANE-C: the optional `researchBundle` prop surfaces the B2 research-agent
 * payload as a collapsible "Research signals" row below the lap metadata.
 * Default state is a single chip with counts (`n comps · m locales · k srcs`);
 * clicking reveals competitor chips, locale insights, and source URLs.
 * Progressive disclosure only — no ambient text walls.
 */

export interface AutoModeFormatCropView {
  formatId: string;
  aspectRatio: string;
  w: number;
  h: number;
  fit: string;
}

export interface AutoModeVariationView {
  id: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed' | 'rejected';
  heroImageUrl?: string;
  /** Atlas URL (4 formats × 4 locales). Preferred over heroImageUrl for display. */
  atlasUrl?: string;
  textOverlays?: Array<{
    zone: {
      purpose: string;
      bbox?: { x: number; y: number; w: number; h: number };
    };
    content: Record<string, string>;
    textAlign?: 'start' | 'center' | 'end';
  }>;
  nativePerFormatRendered?: string[];
  /**
   * Per-format hero URLs (1:1, 4:5, 9:16, 16:9). When populated, the canvas
   * drop uses each entry for the matching format frame instead of repeating
   * the atlas. 1:1 always equals heroImageUrl; 4:5/9:16/16:9 are present
   * when AUTO_MODE_NATIVE_PER_FORMAT renders succeeded and uploaded. Missing
   * formats fall back to atlas → hero in dropVariationOnCanvas.
   */
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  caption?: string;
  captionsByLocale?: Partial<
    Record<'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG', string>
  >;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  formatCrops?: AutoModeFormatCropView[];
  agentRunIds: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/**
 * A named step in the BE pipeline for one Auto-Mode lap.
 * Steps are inferred from variation status transitions + agentRunIds in the
 * UI layer (no Convex schema change needed). Displayed as a mini timeline
 * above the variation cards so creators can see exactly where the lap is.
 */
export interface LapStepView {
  /** Machine-readable step identifier. */
  name: 'url-ingest' | 'vision-describe' | 'sam3-segment' | 'generate' | 'compose-atlas' | 'publish';
  /** Human-readable label shown in the timeline chip. */
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: number;
  finishedAt?: number;
}

/**
 * Lightweight view shape for the cluster Managed Agent's grouping output.
 * Source of truth: lib/agent/managed/cluster.ts ClusterBundle.
 */
export interface ClusterBundleView {
  sessionId?: string;
  latencyMs: number;
  usedManagedAgentsApi: boolean;
  clusters: Array<{
    label: string;
    rationale: string;
    tags: string[];
    memberIndexes: number[];
  }>;
  unclustered: number[];
}

/**
 * Lightweight view shape for the signoff Managed Agent's per-variation
 * decision. Source of truth: lib/agent/managed/signoff.ts SchedulePlan.
 */
export interface SchedulePlanView {
  sessionId?: string;
  latencyMs: number;
  usedManagedAgentsApi: boolean;
  overallRecommendation: string;
  variations: Array<{
    variationIndex: number;
    decision: 'auto-post' | 'hold-for-review' | 'reject';
    rationale: string;
    suggestedSchedule?: { platform: string; whenLocal: string };
  }>;
}

export interface AutoModeCampaignView {
  id: string;
  triggerKind: 'url' | 'file' | 'text';
  triggerPayload: string;
  variationCount: number;
  notifyMode: 'notify' | 'review' | 'auto-post';
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** Inferred step timeline for the lap (C4). Populated by useCampaignLap. */
  lapSteps?: LapStepView[];
  /** B2 research bundle persisted on the campaign row (Convex). Survives a
   *  page refresh — replaces ephemeral component-state holding. */
  researchBundle?: ResearchBundleView;
  /** Signoff Managed Agent's plan persisted on the campaign row. */
  schedulePlan?: SchedulePlanView;
  /** Cluster Managed Agent's bundle persisted on the campaign row. */
  clusterBundle?: ClusterBundleView;
}

/**
 * View-layer subset of the B2 ResearchBundle. Mirrors the shape produced by
 * `lib/agent/managed/research.ts` but kept inline so this UI module doesn't
 * pull in agent-side dependencies. The orchestrator is the source of truth;
 * field semantics: see `ResearchBundle` in lib/agent/managed/research.ts.
 */
export interface ResearchBundleView {
  summary: string;
  competitors: string[];
  recentCampaigns: string[];
  localeInsights: Array<{
    locale: 'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG';
    insight: string;
  }>;
  sources: Array<{ url: string; snippet: string; retrievedAt: string }>;
  latencyMs: number;
  usedManagedAgentsApi: boolean;
}

/**
 * One entry in the lap event log — produced by lib/agent/lap-logger.ts and
 * persisted to Convex `lapEvent`. The right-rail Live Log shows the latest
 * events as they arrive; /inspect renders the full timeline.
 */
export interface LapEventView {
  id: string;
  ts: number;
  variationIndex?: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  message: string;
}

export interface AutoModePanelProps {
  campaign: AutoModeCampaignView | null;
  variations: AutoModeVariationView[];
  /** Called when the user approves a variation. The optional `forcePostNow`
   *  signal is honoured by the auto-post path (the approve endpoint forwards
   *  it to /api/auto-mode/run, which short-circuits the scheduler so all
   *  per-platform publishers fire ~now instead of waiting for whenLocal). */
  onApprove?: (
    variationIndex: number,
    notifyMode: 'review' | 'auto-post',
    forcePostNow?: boolean
  ) => Promise<void>;
  /** Called when the user rejects a variation. */
  onReject?: (variationIndex: number) => Promise<void>;
  /** B2 research bundle from runAutoMode. When present, a collapsible
   *  "Research signals" row appears below the lap metadata. */
  researchBundle?: ResearchBundleView;
  /** Cluster Managed Agent bundle. When present, a "Visual clusters" row
   *  appears below research showing the agent's grouping of refs. */
  clusterBundle?: ClusterBundleView;
  /** Live event tail for the in-flight lap. Surfaced as a collapsible
   *  "lap log" section so creators can debug pipeline progress without
   *  leaving the workspace. Empty array hides the section. */
  events?: LapEventView[];
}

const LOCALE_LABEL: Record<string, string> = {
  'en-SG': 'EN',
  'zh-Hans-SG': '中',
  'ms-SG': 'MS',
  'ta-SG': 'த',
};

const STATUS_TONE: Record<
  AutoModeVariationView['status'] | AutoModeCampaignView['status'],
  'neutral' | 'info' | 'ok' | 'error' | 'warn'
> = {
  pending: 'neutral',
  running: 'info',
  ready: 'ok',
  completed: 'ok',
  failed: 'error',
  rejected: 'warn',
};

function formatRelative(t: number | undefined): string {
  if (!t) return '';
  const delta = Date.now() - t;
  if (delta < 1500) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

const STEP_STATUS_TONE: Record<LapStepView['status'], 'neutral' | 'info' | 'ok' | 'error'> = {
  pending: 'neutral',
  running: 'info',
  done: 'ok',
  failed: 'error',
};

function LapStepTimeline({ steps }: { steps: LapStepView[] }) {
  if (steps.length === 0) return null;
  return (
    <div
      data-testid="lap-step-timeline"
      className="mb-3 flex flex-col gap-1"
      aria-label="lap step timeline"
    >
      {steps.map((step) => (
        <div
          key={step.name}
          data-testid={`lap-step-${step.name}`}
          data-step-status={step.status}
          className="flex items-center gap-1.5"
        >
          <Chip tone={STEP_STATUS_TONE[step.status]} size="sm" variant="ghost">
            {step.label}
          </Chip>
          {step.status === 'running' ? (
            <span className="font-mono text-[9px] text-ink-muted animate-pulse">···</span>
          ) : step.status === 'done' && step.finishedAt && step.startedAt ? (
            <span className="font-mono text-[9px] text-ink-faint">
              {Math.round((step.finishedAt - step.startedAt) / 100) / 10}s
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResearchSignalsSection({ bundle }: { bundle: ResearchBundleView }) {
  const [open, setOpen] = useState(false);
  const compCount = bundle.competitors.length;
  const localeCount = bundle.localeInsights.length;
  const sourceCount = bundle.sources.length;

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="auto-mode-research-toggle"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-left font-mono text-[10px] uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>research</span>
        <Chip tone="info" size="sm" variant="ghost">
          {compCount} comp{compCount === 1 ? '' : 's'}
        </Chip>
        <Chip tone="secondary" size="sm" variant="ghost">
          {localeCount} locale{localeCount === 1 ? '' : 's'}
        </Chip>
        <Chip tone="neutral" size="sm" variant="ghost">
          {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </Chip>
      </button>
      {open ? (
        <div
          data-testid="auto-mode-research-body"
          className="flex flex-col gap-1.5 pl-3"
        >
          {compCount > 0 ? (
            <div className="flex flex-wrap gap-1">
              {bundle.competitors.map((c) => (
                <Chip key={c} tone="info" size="sm" variant="ghost">
                  {c}
                </Chip>
              ))}
            </div>
          ) : null}
          {localeCount > 0 ? (
            <div className="flex flex-col gap-0.5">
              {bundle.localeInsights.map((li) => (
                <div
                  key={`${li.locale}:${li.insight}`}
                  className="font-mono text-[10px] text-ink-muted"
                >
                  <span className="text-ink-faint">
                    {LOCALE_LABEL[li.locale] ?? li.locale}
                  </span>{' '}
                  {li.insight}
                </div>
              ))}
            </div>
          ) : null}
          {sourceCount > 0 ? (
            <div className="flex flex-col gap-0.5">
              {bundle.sources.slice(0, 5).map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-[10px] text-ink-muted hover:text-ink"
                >
                  {s.url}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClusterSection({ bundle }: { bundle: ClusterBundleView }) {
  const [open, setOpen] = useState(false);
  const clusterCount = bundle.clusters.length;
  const memberCount = bundle.clusters.reduce(
    (acc, c) => acc + c.memberIndexes.length,
    0
  );
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="auto-mode-cluster-toggle"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-left font-mono text-[10px] uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>clusters</span>
        <Chip tone="info" size="sm" variant="ghost">
          {clusterCount} group{clusterCount === 1 ? '' : 's'}
        </Chip>
        <Chip tone="neutral" size="sm" variant="ghost">
          {memberCount} ref{memberCount === 1 ? '' : 's'}
        </Chip>
        {bundle.usedManagedAgentsApi ? (
          <Chip tone="secondary" size="sm" variant="ghost">
            managed
          </Chip>
        ) : null}
      </button>
      {open ? (
        <div
          data-testid="auto-mode-cluster-body"
          className="flex flex-col gap-1.5 pl-3"
        >
          {bundle.clusters.map((c, i) => (
            <div key={`${c.label}-${i}`} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Chip tone="info" size="sm" variant="solid">
                  {c.label}
                </Chip>
                <span className="font-mono text-[10px] text-ink-faint">
                  {c.memberIndexes.length} ref{c.memberIndexes.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="font-mono text-[10px] text-ink-muted">
                {c.rationale}
              </div>
              {c.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="font-mono text-[10px] text-ink-faint"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {bundle.unclustered.length > 0 ? (
            <div className="font-mono text-[10px] text-ink-faint">
              {bundle.unclustered.length} unclustered
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LapEventLog({ events }: { events: LapEventView[] }) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...events].sort((a, b) => a.ts - b.ts),
    [events]
  );
  const tail = sorted.slice(-30);

  if (events.length === 0) return null;

  const errorCount = events.filter((e) => e.level === 'error').length;
  const warnCount = events.filter((e) => e.level === 'warn').length;

  const levelTone: Record<LapEventView['level'], 'neutral' | 'info' | 'warn' | 'error'> = {
    debug: 'neutral',
    info: 'info',
    warn: 'warn',
    error: 'error',
  };
  const levelGlyph: Record<LapEventView['level'], string> = {
    debug: '·',
    info: '✓',
    warn: '⚠',
    error: '✗',
  };

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="auto-mode-lap-log-toggle"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-left font-mono text-[10px] uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>lap log</span>
        <Chip tone="neutral" size="sm" variant="ghost">
          {events.length} events
        </Chip>
        {errorCount > 0 ? (
          <Chip tone="error" size="sm" variant="ghost">
            {errorCount} err
          </Chip>
        ) : null}
        {warnCount > 0 ? (
          <Chip tone="warn" size="sm" variant="ghost">
            {warnCount} warn
          </Chip>
        ) : null}
      </button>
      {open ? (
        <div
          data-testid="auto-mode-lap-log-body"
          className="flex flex-col gap-0.5 max-h-72 overflow-y-auto pl-3 pr-1"
        >
          {tail.map((e) => (
            <div
              key={e.id}
              data-event-level={e.level}
              data-event-tag={e.tag}
              className="flex items-start gap-1.5 font-mono text-[10px]"
            >
              <Chip tone={levelTone[e.level]} size="sm" variant="ghost">
                {levelGlyph[e.level]}
              </Chip>
              <span className="text-ink-faint shrink-0">
                {e.tag}
                {e.variationIndex != null ? `@v${e.variationIndex}` : ''}
              </span>
              <span className="text-ink-muted truncate">{e.message}</span>
            </div>
          ))}
          {events.length > tail.length ? (
            <div className="font-mono text-[10px] text-ink-faint pt-1">
              showing latest {tail.length} of {events.length} — full log on /inspect
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AutoModePanel({
  campaign,
  variations,
  onApprove,
  onReject,
  researchBundle,
  clusterBundle,
  events,
}: AutoModePanelProps) {
  const sorted = useMemo(
    () => [...variations].sort((a, b) => a.index - b.index),
    [variations]
  );

  if (!campaign) {
    return (
      <Surface tone="panel-muted" border="soft" className="p-3">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
          Auto Mode
        </div>
        <div className="mt-1 text-sm text-ink-muted">
          No lap yet. Drop a URL or files with auto-mode on.
        </div>
      </Surface>
    );
  }

  const okCount = sorted.filter((v) => v.status === 'ready').length;

  return (
    <Surface tone="panel" border="default" className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
          Auto Mode · {campaign.triggerKind}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/inspect/${campaign.id}`}
            target="_blank"
            rel="noreferrer"
            data-testid="auto-mode-inspect-link"
            title="Open full lap inspector"
            className="font-mono text-[10px] text-ink-muted hover:text-ink"
          >
            ↗ inspect
          </a>
          <Chip tone={STATUS_TONE[campaign.status]} size="sm" variant="solid">
            {campaign.status}
          </Chip>
        </div>
      </div>

      <div className="text-xs text-ink-muted mb-3">
        <div className="truncate">{campaign.triggerPayload}</div>
        <div className="font-mono text-[10px] mt-0.5">
          {campaign.variationCount} variations · {campaign.notifyMode} ·{' '}
          {okCount}/{campaign.variationCount} ready · {formatRelative(campaign.startedAt)}
        </div>
      </div>

      {/* C4: Step timeline — shows named BE steps with status chips */}
      {campaign.lapSteps && campaign.lapSteps.length > 0 ? (
        <LapStepTimeline steps={campaign.lapSteps} />
      ) : null}

      {/* LANE-C: B2 research signals — collapsed by default. */}
      {researchBundle ? <ResearchSignalsSection bundle={researchBundle} /> : null}

      {/* Cluster Managed Agent grouping — collapsed by default. */}
      {clusterBundle ? <ClusterSection bundle={clusterBundle} /> : null}

      {/* Live lap log — collapsed by default. Surfaces structured events so
          creators can debug pipeline progress without leaving the workspace. */}
      {events && events.length > 0 ? <LapEventLog events={events} /> : null}

      <div className="flex flex-col gap-2">
        {sorted.map((v) => (
          <VariationCard
            key={v.id}
            variation={v}
            campaignId={campaign.id}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </div>
    </Surface>
  );
}

function VariationCard({
  variation,
  campaignId,
  onApprove,
  onReject,
}: {
  variation: AutoModeVariationView;
  campaignId: string;
  onApprove?: (
    variationIndex: number,
    notifyMode: 'review' | 'auto-post',
    forcePostNow?: boolean
  ) => Promise<void>;
  onReject?: (variationIndex: number) => Promise<void>;
}) {
  // Thin adapters bind the variation index to the parent-shaped callbacks
  // so VariationActions can call them as (notifyMode, forcePostNow?). Only
  // forwards forcePostNow when truthy — keeps the parent call shape minimal
  // for the review/schedule paths and matches the existing test contract.
  const onApproveBound = useCallback(
    async (notifyMode: 'review' | 'auto-post', forcePostNow?: boolean) => {
      if (!onApprove) return;
      if (forcePostNow) {
        await onApprove(variation.index, notifyMode, true);
      } else {
        await onApprove(variation.index, notifyMode);
      }
    },
    [onApprove, variation.index]
  );
  const onRejectBound = useCallback(async () => {
    if (!onReject) return;
    await onReject(variation.index);
  }, [onReject, variation.index]);

  const localeKeys = variation.captionsByLocale
    ? (Object.keys(variation.captionsByLocale) as Array<
        keyof NonNullable<AutoModeVariationView['captionsByLocale']>
      >)
    : [];
  const formats = variation.formatCrops ?? [];

  return (
    <Surface tone="panel-muted" border="soft" className="p-2">
      <div className="flex items-start gap-2">
        {variation.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={variation.heroImageUrl}
            alt={`variation ${variation.index} hero`}
            className="w-12 h-12 rounded object-cover bg-surface-panel-muted shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-surface-panel-muted shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[10px] text-ink-muted">v{variation.index}</span>
            <Chip tone={STATUS_TONE[variation.status]} size="sm" variant="solid">
              {variation.status}
            </Chip>
            {variation.schedulePlatform ? (
              <Chip tone="neutral" size="sm" variant="ghost">
                {variation.schedulePlatform}
              </Chip>
            ) : null}
          </div>

          {variation.caption ? (
            <div className="text-xs text-ink leading-snug line-clamp-2">{variation.caption}</div>
          ) : null}

          {variation.moodNote ? (
            <div className="font-mono text-[10px] text-ink-muted mt-1">{variation.moodNote}</div>
          ) : null}

          {variation.hashtags && variation.hashtags.length > 0 ? (
            <div className="flex gap-1 flex-wrap mt-1">
              {variation.hashtags.slice(0, 3).map((tag) => (
                <span key={tag} className="font-mono text-[10px] text-ink-muted">
                  {tag}
                </span>
              ))}
              {variation.hashtags.length > 3 ? (
                <span className="font-mono text-[10px] text-ink-muted">
                  +{variation.hashtags.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}

          {(localeKeys.length > 0 || formats.length > 0) && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {localeKeys.map((locale) => (
                <Chip key={locale} tone="info" size="sm" variant="ghost" title={String(locale)}>
                  {LOCALE_LABEL[String(locale)] ?? String(locale)}
                </Chip>
              ))}
              {formats.map((f) => (
                <Chip
                  key={f.formatId}
                  tone="secondary"
                  size="sm"
                  variant="ghost"
                  title={`${f.aspectRatio} (${f.fit})`}
                >
                  {f.aspectRatio}
                </Chip>
              ))}
            </div>
          )}

          {variation.error ? (
            <div className="font-mono text-[10px] text-signal-error mt-1">{variation.error}</div>
          ) : null}

          <VariationActions
            campaignId={campaignId}
            variationIndex={variation.index}
            status={variation.status}
            onApprove={onApprove ? onApproveBound : undefined}
            onReject={onReject ? onRejectBound : undefined}
          />
        </div>
      </div>
    </Surface>
  );
}
