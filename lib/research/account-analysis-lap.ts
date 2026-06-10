import { searchXViaXquik } from '@/lib/research/event-recap/xquik';
import type { PlatformScrapeResult } from '@/lib/research/event-recap/types';
import type { ReferenceAccountPost } from '@/lib/research/account-analysis';

export interface AccountAnalysisLapInput {
  handles: string[];
  maxPostsPerHandle?: number;
  windowStart?: string;
  windowEnd?: string;
}

const DEFAULT_WINDOW_DAYS = 30;

export async function collectReferenceAccountPosts(
  input: AccountAnalysisLapInput
): Promise<ReferenceAccountPost[]> {
  const maxPostsPerHandle = clampPostLimit(input.maxPostsPerHandle);
  const windowEnd = input.windowEnd ?? new Date().toISOString();
  const windowStart =
    input.windowStart ??
    new Date(Date.parse(windowEnd) - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const out: ReferenceAccountPost[] = [];
  const seen = new Set<string>();

  for (const handle of normalizeHandles(input.handles)) {
    const result = await searchXViaXquik({
      querySet: [`from:${handle.replace(/^@/, '')}`],
      windowStart,
      windowEnd,
      maxItems: maxPostsPerHandle,
      maxQueries: 1,
    });
    for (const post of mapXquikPosts(result, handle).slice(0, maxPostsPerHandle)) {
      const key = post.postUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(post);
    }
  }

  return out;
}

export function clampPostLimit(value: unknown): number {
  return Math.max(
    1,
    Math.min(50, typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 50)
  );
}

function mapXquikPosts(
  result: PlatformScrapeResult,
  fallbackHandle: string
): ReferenceAccountPost[] {
  const capturedAt = new Date().toISOString();
  const posts: ReferenceAccountPost[] = [];
  for (const post of result.posts) {
    if (!post.url || !post.text || !post.postedAt) continue;
    posts.push({
      handle: normalizeHandle(post.authorHandle ?? fallbackHandle),
      postUrl: post.url,
      text: post.text,
      postedAt: post.postedAt,
      capturedAt,
      hasMedia: Boolean(post.media && post.media.length > 0),
      metrics: {
        likes: post.metrics.likes,
        reposts: post.metrics.reposts,
        replies: post.metrics.replies,
        impressions: post.metrics.impressions ?? post.metrics.views,
      },
    });
  }
  return posts;
}

function normalizeHandles(handles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of handles) {
    const handle = normalizeHandle(raw);
    if (!handle || seen.has(handle.toLowerCase())) continue;
    seen.add(handle.toLowerCase());
    out.push(handle);
  }
  return out;
}

function normalizeHandle(value: string): string {
  const handle = value.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '@');
  const normalized = handle.startsWith('@') ? handle : `@${handle}`;
  return normalized.replace(/\/.*$/, '');
}
