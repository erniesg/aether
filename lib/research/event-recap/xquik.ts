import type { EventPostMedia, PlatformScrapeResult } from './types';
import { bestDisplayAuthorName, makePostId, normalizeQuerySet } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type XquikEnv = Partial<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

export interface XquikSearchInput {
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
  maxQueries?: number;
  seenPostUrls?: string[];
}

interface XquikTweetAuthor {
  userName: string;
  name: string;
}

interface XquikTweetMedia {
  url: string;
  type: string;
}

interface XquikTweet {
  id: string;
  text: string;
  author: XquikTweetAuthor;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount: number;
  quoteCount: number;
  media: XquikTweetMedia[];
}

interface XquikSearchResponse {
  tweets: XquikTweet[];
  hasMore: boolean;
  nextCursor: string;
}

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

export function isXquikConfigured(env: XquikEnv = process.env): boolean {
  return Boolean(env.XQUIK_API_KEY?.trim());
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export async function searchXViaXquik(
  input: XquikSearchInput,
  env: XquikEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const apiKey = env.XQUIK_API_KEY?.trim();
  if (!apiKey) {
    return {
      platform: 'x',
      posts: [],
      warnings: ['Xquik API key is not configured'],
      raw: {},
    };
  }

  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 6);
  const seenUrls = new Set((input.seenPostUrls ?? []).map(xPostUrlKey));
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  const warnings: string[] = [];

  for (const query of queries) {
    if (byUrl.size >= input.maxItems) break;

    const remaining = input.maxItems - byUrl.size;
    const url = buildSearchUrl(query, input.windowStart, input.windowEnd, remaining);

    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          'x-api-key': apiKey,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Xquik query "${query}" failed: ${message}`);
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Xquik X search failed: HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    let parsed: XquikSearchResponse;
    try {
      parsed = JSON.parse(text) as XquikSearchResponse;
    } catch {
      warnings.push(`Xquik query "${query}" returned non-JSON response`);
      continue;
    }

    const tweets = Array.isArray(parsed.tweets) ? parsed.tweets : [];
    for (const tweet of tweets) {
      if (byUrl.size >= input.maxItems) break;
      const post = normalizeTweet(tweet);
      if (!post) continue;
      const key = xPostUrlKey(post.url);
      if (seenUrls.has(key) || byUrl.has(key)) continue;
      byUrl.set(key, post);
    }
  }

  return {
    platform: 'x',
    posts: Array.from(byUrl.values()),
    warnings,
    raw: { queries, itemsCollected: byUrl.size },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSearchUrl(
  query: string,
  windowStart: string,
  windowEnd: string,
  limit: number
): string {
  const base = 'https://xquik.com/api/v1/x/tweets/search';
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(Math.max(1, Math.min(100, limit))));

  const sinceDate = isoDateOnly(windowStart);
  const untilDate = isoDateOnly(windowEnd);
  if (sinceDate) params.set('sinceDate', sinceDate);
  if (untilDate) params.set('untilDate', untilDate);

  return `${base}?${params.toString()}`;
}

function normalizeTweet(tweet: XquikTweet): PlatformScrapeResult['posts'][number] | null {
  if (!tweet || typeof tweet !== 'object') return null;
  const id = stringValue(tweet.id);
  const author = tweet.author;
  if (!author || typeof author !== 'object') return null;
  const handle = stringValue(author.userName);
  const text = stringValue(tweet.text);
  if (!id || !handle || !text) return null;

  const url = `https://x.com/${handle}/status/${id}`;

  return {
    postId: makePostId('x', url, text),
    platform: 'x',
    url,
    authorName: bestDisplayAuthorName({
      platform: 'x',
      authorName: stringValue(author.name) || undefined,
      authorHandle: handle,
    }),
    authorHandle: handle,
    authorUrl: `https://x.com/${handle}`,
    text,
    postedAt: stringValue(tweet.createdAt) || undefined,
    metrics: {
      likes: numberValue(tweet.likeCount),
      reposts: numberValue(tweet.retweetCount),
      replies: numberValue(tweet.replyCount),
      views: numberValue(tweet.viewCount),
      impressions: numberValue(tweet.viewCount),
    },
    media: mediaFromTweet(tweet),
    tags: ['xquik'],
    raw: tweet,
  };
}

function mediaFromTweet(tweet: XquikTweet): EventPostMedia[] | undefined {
  if (!Array.isArray(tweet.media) || tweet.media.length === 0) return undefined;
  const out: EventPostMedia[] = [];
  for (const item of tweet.media) {
    const url = stringValue(item.url);
    if (!url) continue;
    out.push({
      url,
      type: xquikMediaType(stringValue(item.type)),
      source: 'xquik',
    });
  }
  return out.length ? out : undefined;
}

function xquikMediaType(value: string): EventPostMedia['type'] {
  const lower = value.toLowerCase();
  if (lower === 'photo' || lower === 'image') return 'image';
  if (lower === 'video') return 'video';
  if (lower === 'animated_gif' || lower === 'gif') return 'gif';
  return 'unknown';
}

function xPostUrlKey(value: string): string {
  const normalized = normalizeXPostUrl(value);
  return (normalized ?? value.trim().split(/[?#]/)[0].replace(/\/$/, '')).toLowerCase();
}

function normalizeXPostUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)) return undefined;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (!match) return undefined;
    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch {
    return undefined;
  }
}

function isoDateOnly(value: string): string | undefined {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
