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
  userName?: string;
  username?: string;
  name?: string;
  profilePicture?: string;
  description?: string;
  location?: string;
  followers?: number | string;
  following?: number | string;
  verified?: boolean;
}

interface XquikTweetMedia {
  url?: string;
  mediaUrl?: string;
  media_url?: string;
  media_url_https?: string;
  type?: string;
  previewUrl?: string;
  preview_image_url?: string;
  width?: number | string;
  height?: number | string;
}

interface XquikTweet {
  id: string;
  text: string;
  url?: string;
  author?: XquikTweetAuthor;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount: number;
  bookmarkCount?: number;
  quoteCount: number;
  media: XquikTweetMedia[];
}

interface XquikSearchResponse {
  tweets: XquikTweet[];
  hasMore?: boolean;
  nextCursor?: string;
  has_next_page?: boolean;
  next_cursor?: string;
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
  let itemsReturned = 0;
  let skippedSeen = 0;
  let skippedInvalid = 0;
  const nextCursors: string[] = [];

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
    itemsReturned += tweets.length;
    const nextCursor = stringValue(parsed.nextCursor ?? parsed.next_cursor);
    if (nextCursor) nextCursors.push(nextCursor);
    for (const tweet of tweets) {
      if (byUrl.size >= input.maxItems) break;
      const post = normalizeTweet(tweet);
      if (!post) {
        skippedInvalid += 1;
        continue;
      }
      const key = xPostUrlKey(post.url);
      if (seenUrls.has(key)) {
        skippedSeen += 1;
        continue;
      }
      if (byUrl.has(key)) continue;
      byUrl.set(key, post);
    }
  }

  if (itemsReturned > 0 && byUrl.size === 0 && skippedInvalid > 0) {
    warnings.push(
      `Xquik returned ${itemsReturned} tweets, but none normalized; check response contract fields.`
    );
  }

  return {
    platform: 'x',
    posts: Array.from(byUrl.values()),
    warnings,
    raw: {
      queries,
      itemsReturned,
      itemsCollected: byUrl.size,
      skippedSeen,
      skippedInvalid,
      nextCursors,
    },
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
  params.set('limit', String(Math.max(1, Math.min(200, limit))));

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
  const handle = stringValue(author.userName ?? author.username);
  const text = stringValue(tweet.text);
  if (!id || !handle || !text) return null;

  const url = normalizeXPostUrl(stringValue(tweet.url)) ?? `https://x.com/${handle}/status/${id}`;

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
    authorMeta: {
      description: stringValue(author.description) || undefined,
      location: stringValue(author.location) || undefined,
      followers: numberValue(author.followers),
      following: numberValue(author.following),
      verified: booleanValue(author.verified),
      profileImageUrl: stringValue(author.profilePicture) || undefined,
    },
    text,
    postedAt: normalizeDateString(tweet.createdAt),
    metrics: {
      likes: numberValue(tweet.likeCount),
      reposts: numberValue(tweet.retweetCount),
      replies: numberValue(tweet.replyCount),
      comments: numberValue(tweet.replyCount),
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
    const url = stringValue(item.url ?? item.mediaUrl ?? item.media_url_https ?? item.media_url);
    if (!url) continue;
    out.push({
      url,
      type: xquikMediaType(stringValue(item.type)),
      source: 'xquik',
      previewUrl: stringValue(item.previewUrl ?? item.preview_image_url) || undefined,
      width: numberValue(item.width),
      height: numberValue(item.height),
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

function normalizeDateString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value.trim();
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
