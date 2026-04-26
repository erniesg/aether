'use client';

import { useCallback, useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';

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
}

export interface AutoModePanelProps {
  campaign: AutoModeCampaignView | null;
  variations: AutoModeVariationView[];
  /** Called when the user approves a variation. Passes the variation index. */
  onApprove?: (variationIndex: number, notifyMode: 'review' | 'auto-post') => Promise<void>;
  /** Called when the user rejects a variation. */
  onReject?: (variationIndex: number) => Promise<void>;
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

export function AutoModePanel({ campaign, variations, onApprove, onReject }: AutoModePanelProps) {
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
        <Chip tone={STATUS_TONE[campaign.status]} size="sm" variant="solid">
          {campaign.status}
        </Chip>
      </div>

      <div className="text-xs text-ink-muted mb-3">
        <div className="truncate">{campaign.triggerPayload}</div>
        <div className="font-mono text-[10px] mt-0.5">
          {campaign.variationCount} variations · {campaign.notifyMode} ·{' '}
          {okCount}/{campaign.variationCount} ready · {formatRelative(campaign.startedAt)}
        </div>
      </div>

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
  campaignId: _campaignId,
  onApprove,
  onReject,
}: {
  variation: AutoModeVariationView;
  campaignId: string;
  onApprove?: (variationIndex: number, notifyMode: 'review' | 'auto-post') => Promise<void>;
  onReject?: (variationIndex: number) => Promise<void>;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  const handleApprove = useCallback(
    async (notifyMode: 'review' | 'auto-post') => {
      if (!onApprove || approving || rejecting) return;
      setApproving(true);
      try {
        await onApprove(variation.index, notifyMode);
        setApproved(true);
      } finally {
        setApproving(false);
      }
    },
    [onApprove, variation.index, approving, rejecting]
  );

  const handleReject = useCallback(async () => {
    if (!onReject || approving || rejecting) return;
    setRejecting(true);
    try {
      await onReject(variation.index);
      setRejected(true);
    } finally {
      setRejecting(false);
    }
  }, [onReject, variation.index, approving, rejecting]);
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

          {/* Approve / reject / schedule — shown when status is ready and not yet actioned */}
          {variation.status === 'ready' && !rejected && (
            <div className="flex flex-col gap-1.5 mt-2">
              {!approved ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={approving || rejecting}
                    onClick={() => void handleApprove('review')}
                    data-testid={`variation-approve-${variation.index}`}
                  >
                    {approving ? 'approving…' : 'approve'}
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={approving || rejecting}
                    onClick={() => setScheduleOpen((prev) => !prev)}
                    data-testid={`variation-schedule-${variation.index}`}
                  >
                    schedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={approving || rejecting}
                    onClick={() => void handleReject()}
                    data-testid={`variation-reject-${variation.index}`}
                  >
                    {rejecting ? 'rejecting…' : 'reject'}
                  </Button>
                </div>
              ) : (
                <div className="font-mono text-[10px] text-signal-ok mt-1">approved</div>
              )}
              {scheduleOpen && !approved && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    data-testid={`variation-schedule-input-${variation.index}`}
                    className="w-full rounded border border-border-soft bg-surface-panel px-2 py-1 font-mono text-[10px] text-ink focus:border-accent focus:outline-none"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!scheduleDate || approving}
                    onClick={() => void handleApprove('auto-post')}
                    data-testid={`variation-schedule-confirm-${variation.index}`}
                  >
                    confirm &amp; post
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}
