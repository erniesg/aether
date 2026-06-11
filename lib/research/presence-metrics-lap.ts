import { searchXViaXquik } from '@/lib/research/event-recap/xquik';
import type { PlatformScrapeResult } from '@/lib/research/event-recap/types';
import type { PresencePostMetric } from './presence-metrics';

export interface PresenceMetricsLapInput {
  profileId: string;
  handle: string;
  maxPosts?: number;
  windowStart?: string;
  windowEnd?: string;
}

const DEFAULT_WINDOW_DAYS = 30;

export async function collectOwnHandleMetrics(
  input: PresenceMetricsLapInput
): Promise<PresencePostMetric[]> {
  const maxPosts = clampPresenceMetricLimit(input.maxPosts);
  const handle = normalizeHandle(input.handle);
  const windowEnd = input.windowEnd ?? new Date().toISOString();
  const windowStart =
    input.windowStart ??
    new Date(Date.parse(windowEnd) - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await searchXViaXquik({
    querySet: [`from:${handle.replace(/^@/, '')}`],
    windowStart,
    windowEnd,
    maxItems: maxPosts,
    maxQueries: 1,
  });
  return mapXquikMetricPosts(result, input.profileId).slice(0, maxPosts);
}

export function clampPresenceMetricLimit(value: unknown): number {
  return Math.max(
    1,
    Math.min(50, typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 50)
  );
}

function mapXquikMetricPosts(
  result: PlatformScrapeResult,
  profileId: string
): PresencePostMetric[] {
  const capturedAt = new Date().toISOString();
  const out: PresencePostMetric[] = [];
  const seen = new Set<string>();
  for (const post of result.posts) {
    if (!post.url) continue;
    const key = post.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      profileId,
      postUrl: post.url,
      capturedAt,
      likes: post.metrics.likes ?? 0,
      reposts: post.metrics.reposts ?? 0,
      replies: post.metrics.replies ?? post.metrics.comments ?? 0,
      impressions: post.metrics.impressions ?? post.metrics.views,
    });
  }
  return out;
}

function normalizeHandle(value: string): string {
  const handle = value.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '@');
  const normalized = handle.startsWith('@') ? handle : `@${handle}`;
  return normalized.replace(/\/.*$/, '');
}
