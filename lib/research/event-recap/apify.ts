import type { EventAuthorMeta, EventPostMedia, PlatformScrapeResult } from './types';
import { makePostId, normalizeQuerySet } from './utils';

type ApifyEnv = Partial<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

export type ApifyXSort = 'Top' | 'Latest' | 'Latest + Top';

export const APIFY_TWEET_SCRAPER_ACTOR_ID = '61RPP7dywgiy0JPD0';
export const APIFY_TWITTER_SCRAPER_LITE_ACTOR_ID = 'nfp1fpt5gUlBwPcor';

interface ApifyRunInput {
  startUrls?: string[];
  searchTerms?: string[];
  maxItems: number;
  sort?: ApifyXSort;
  tweetLanguage?: string;
  includeSearchTerms?: boolean;
  start?: string;
  end?: string;
}

export interface ApifyXSearchInput {
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
  maxQueries?: number;
  actorId?: string;
  sort?: ApifyXSort;
  tweetLanguage?: string;
  candidateMultiplier?: number;
  seenPostUrls?: string[];
}

export function isApifyConfigured(env: ApifyEnv = process.env): boolean {
  return Boolean(env.APIFY_API_TOKEN?.trim() || env.APIFY_TOKEN?.trim());
}

export async function searchXViaApify(
  input: ApifyXSearchInput,
  env: ApifyEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const token = apifyToken(env);
  if (!token) {
    return {
      platform: 'x',
      posts: [],
      warnings: ['Apify token is not configured'],
      raw: {},
    };
  }

  const actorId = input.actorId?.trim() || env.APIFY_X_ACTOR_ID?.trim() || APIFY_TWEET_SCRAPER_ACTOR_ID;
  const seenUrls = new Set((input.seenPostUrls ?? []).map(xPostUrlKey));
  const runInput = buildApifyXRunInput(input);
  const res = await fetcher(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(runInput),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Apify X actor failed: HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const items = parseApifyItems(text);
  const sentinelItems = items.filter(isApifySentinelItem);
  let skippedSeen = 0;
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  for (const item of items) {
    if (isApifySentinelItem(item)) continue;
    const post = normalizeApifyXTweet(item);
    if (!post) continue;
    const key = xPostUrlKey(post.url);
    if (seenUrls.has(key)) {
      skippedSeen += 1;
      continue;
    }
    byUrl.set(key, post);
    if (byUrl.size >= input.maxItems) break;
  }

  return {
    platform: 'x',
    posts: Array.from(byUrl.values()).slice(0, input.maxItems),
    warnings: apifyWarnings({
      actorId,
      itemsReturned: items.length,
      sentinelItems: sentinelItems.length,
      skippedSeen,
      posts: byUrl.size,
    }),
    raw: {
      actorId,
      input: runInput,
      itemsReturned: items.length,
      sentinelItems: sentinelItems.length,
      skippedSeen,
    },
  };
}

export function normalizeApifyXTweet(item: unknown): PlatformScrapeResult['posts'][number] | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const id = stringValue(
    record.id ??
      record.tweetId ??
      record.tweet_id ??
      record.id_str ??
      record.rest_id ??
      record.restId
  );
  const author = objectValue(record.author) ?? objectValue(record.user) ?? {};
  const handle = stripAt(
    stringValue(
      record.authorHandle ??
        record.authorUsername ??
        record.userName ??
        record.username ??
        record.screenName ??
        author.userName ??
        author.username ??
        author.screen_name ??
        author.screenName
    )
  );
  const url =
    normalizeXPostUrl(stringValue(record.url ?? record.twitterUrl ?? record.tweetUrl)) ??
    (handle && id ? `https://x.com/${handle}/status/${id}` : undefined);
  const text = stringValue(record.fullText ?? record.text ?? record.tweetText ?? record.content);
  if (!url || !text) return null;

  return {
    postId: makePostId('x', url, text),
    platform: 'x',
    url,
    authorName:
      stringValue(record.authorName ?? record.name ?? author.name ?? author.fullName) || handle || 'unknown',
    authorHandle: handle,
    authorUrl: handle ? `https://x.com/${handle}` : undefined,
    authorMeta: authorMetaFromApify(record, author),
    text,
    postedAt: stringValue(record.createdAt ?? record.created_at ?? record.timestamp) || undefined,
    metrics: {
      likes: numberValue(record.likeCount ?? record.favoriteCount ?? record.favorites ?? record.likes),
      reposts: combinedReposts(record),
      replies: numberValue(record.replyCount ?? record.replies),
      impressions: numberValue(record.viewCount ?? record.views ?? record.impressionCount),
      views: numberValue(record.viewCount ?? record.views ?? record.impressionCount),
    },
    media: mediaFromApifyTweet(record),
    tags: ['apify-x'],
    raw: item,
  };
}

function buildApifyXRunInput(input: ApifyXSearchInput): ApifyRunInput {
  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 12);
  const startUrls = normalizeQuerySet(
    queries.filter((query) => normalizeXPostUrl(query) || isXUrl(query)),
    200
  );
  const searchTerms = normalizeQuerySet(
    queries
      .filter((query) => !normalizeXPostUrl(query) && !isXUrl(query))
      .map((query) => query.replace(/\s+-is:retweet\b/gi, '').trim()),
    input.maxQueries ?? 12
  );
  const multiplier =
    typeof input.candidateMultiplier === 'number' && Number.isFinite(input.candidateMultiplier)
      ? Math.max(1, Math.min(5, input.candidateMultiplier))
      : 1;
  const maxItems = Math.max(1, Math.min(1000, Math.ceil(input.maxItems * multiplier)));
  return {
    ...(startUrls.length ? { startUrls } : {}),
    ...(searchTerms.length ? { searchTerms } : {}),
    maxItems,
    sort: input.sort ?? 'Latest',
    tweetLanguage: input.tweetLanguage ?? 'en',
    includeSearchTerms: true,
    start: isoDateOnly(input.windowStart),
    end: isoDateOnly(input.windowEnd),
  };
}

function apifyWarnings(input: {
  actorId: string;
  itemsReturned: number;
  sentinelItems: number;
  skippedSeen: number;
  posts: number;
}): string[] {
  const warnings = [
    `Apify X actor ${input.actorId} returned ${input.itemsReturned} rows; skipped ${input.skippedSeen} already-seen X URLs.`,
  ];
  if (input.sentinelItems > 0) {
    warnings.push(
      `Apify returned ${input.sentinelItems} sentinel rows such as noResults/demo; if every row is sentinel, check actor plan/API access and run logs.`
    );
  }
  if (input.posts === 0) {
    warnings.push('Apify returned no usable X posts after dedupe and sentinel filtering.');
  }
  return warnings;
}

function parseApifyItems(text: string): unknown[] {
  const parsed = JSON.parse(text || '[]') as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function isApifySentinelItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  return record.noResults === true || record.demo === true;
}

function authorMetaFromApify(
  record: Record<string, unknown>,
  author: Record<string, unknown>
): EventAuthorMeta | undefined {
  const meta: EventAuthorMeta = {
    description: stringValue(record.authorDescription ?? author.description) || undefined,
    location: stringValue(record.location ?? author.location) || undefined,
    followers: numberValue(record.followers ?? record.followersCount ?? author.followers ?? author.followersCount),
    following: numberValue(record.following ?? record.followingCount ?? author.following ?? author.followingCount),
    posts: numberValue(record.statusesCount ?? record.tweetCount ?? author.statusesCount ?? author.tweetCount),
    verified: booleanValue(record.verified ?? author.verified),
    verifiedType: stringValue(record.verifiedType ?? author.verifiedType) || undefined,
    profileImageUrl:
      stringValue(record.profileImageUrl ?? record.profile_image_url ?? author.profileImageUrl ?? author.profile_image_url) ||
      undefined,
  };
  return Object.values(meta).some((value) => value !== undefined) ? meta : undefined;
}

function combinedReposts(record: Record<string, unknown>): number | undefined {
  const explicit = numberValue(record.repostCount ?? record.reposts);
  if (explicit !== undefined) return explicit;
  const retweets = numberValue(record.retweetCount ?? record.retweets) ?? 0;
  const quotes = numberValue(record.quoteCount ?? record.quotes) ?? 0;
  const total = retweets + quotes;
  return total > 0 ? total : undefined;
}

function mediaFromApifyTweet(record: Record<string, unknown>): EventPostMedia[] | undefined {
  const out = new Map<string, EventPostMedia>();
  const add = (media: EventPostMedia) => {
    const url = media.url.trim();
    if (!url || out.has(url)) return;
    out.set(url, { ...media, url });
  };
  for (const source of [
    record.media,
    record.photos,
    record.images,
    record.videos,
    objectValue(record.entities)?.media,
    objectValue(record.extendedEntities)?.media,
    objectValue(record.extended_entities)?.media,
  ]) {
    collectMedia(source, add);
  }
  const media = Array.from(out.values());
  return media.length ? media : undefined;
}

function collectMedia(value: unknown, add: (media: EventPostMedia) => void) {
  if (!value) return;
  if (typeof value === 'string') {
    if (isLikelyXMediaUrl(value)) {
      add({ url: value, type: mediaTypeFromUrl(value), source: 'apify-x' });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMedia(item, add);
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const url = stringValue(
    record.media_url_https ??
      record.media_url ??
      record.mediaUrl ??
      record.url ??
      record.fullUrl ??
      record.expandedUrl ??
      record.preview_image_url ??
      record.previewUrl ??
      record.thumbnailUrl
  );
  const previewUrl = stringValue(record.preview_image_url ?? record.previewUrl ?? record.thumbnailUrl);
  const pickedUrl = url || previewUrl;
  if (pickedUrl && isLikelyXMediaUrl(pickedUrl)) {
    add({
      url: pickedUrl,
      type: mediaTypeFromValue(stringValue(record.type), pickedUrl),
      source: 'apify-x',
      previewUrl: previewUrl || undefined,
      altText: stringValue(record.altText ?? record.ext_alt_text ?? record.alt_text) || undefined,
      width: numberValue(record.width),
      height: numberValue(record.height),
    });
  }
}

function mediaTypeFromValue(value: string, url: string): EventPostMedia['type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('photo') || normalized.includes('image')) return 'image';
  return mediaTypeFromUrl(url);
}

function mediaTypeFromUrl(url: string): EventPostMedia['type'] {
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(?:$|\?)/.test(lower)) return 'video';
  if (/\.gif(?:$|\?)/.test(lower)) return 'gif';
  if (/\.(png|jpe?g|webp|avif)(?:$|\?)/.test(lower) || lower.includes('pbs.twimg.com/media')) {
    return 'image';
  }
  return 'unknown';
}

function isLikelyXMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('pbs.twimg.com/media') ||
    lower.includes('video.twimg.com') ||
    lower.includes('ton.twitter.com') ||
    /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)(?:$|\?)/.test(lower)
  );
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

function xPostUrlKey(value: string): string {
  const normalized = normalizeXPostUrl(value);
  return (normalized ?? value.trim().split(/[?#]/)[0].replace(/\/$/, '')).toLowerCase();
}

function isXUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isoDateOnly(value: string): string | undefined {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
}

function apifyToken(env: ApifyEnv): string | undefined {
  return env.APIFY_API_TOKEN?.trim() || env.APIFY_TOKEN?.trim() || undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stripAt(value: string): string | undefined {
  const stripped = value.replace(/^@/, '').trim();
  return stripped || undefined;
}
