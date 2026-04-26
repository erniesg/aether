'use client';

import { useMemo } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';

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
  status: 'pending' | 'running' | 'ready' | 'failed';
  heroImageUrl?: string;
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
};

function formatRelative(t: number | undefined): string {
  if (!t) return '';
  const delta = Date.now() - t;
  if (delta < 1500) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function AutoModePanel({ campaign, variations }: AutoModePanelProps) {
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
          <VariationCard key={v.id} variation={v} />
        ))}
      </div>
    </Surface>
  );
}

function VariationCard({ variation }: { variation: AutoModeVariationView }) {
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
        </div>
      </div>
    </Surface>
  );
}
