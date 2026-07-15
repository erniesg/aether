import { TwitterApi } from 'twitter-api-v2';
import type { EventAuthorMeta, EventPostMedia, PlatformScrapeResult } from './types';
import { makePostId, normalizeQuerySet } from './utils';

type XSearchEnv = Partial<Record<string, string | undefined>>;

interface XUser {
  id: string;
  name?: string;
  username?: string;
  description?: string;
  location?: string;
  verified?: boolean;
  verified_type?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
}

interface XTweet {
  id: string;
  text: string;
  author_id?: string;
  attachments?: {
    media_keys?: string[];
  };
  created_at?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{ type: string; id: string }>;
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
      unwound_url?: string;
      display_url?: string;
      title?: string;
      description?: string;
      images?: Array<{ url?: string; width?: number; height?: number }>;
    }>;
  };
  lang?: string;
}

interface XMediaVariant {
  bit_rate?: number;
  content_type?: string;
  url?: string;
}

interface XMedia {
  media_key: string;
  type?: 'photo' | 'video' | 'animated_gif' | string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  variants?: XMediaVariant[];
}

interface XQueryPlan {
  query: string;
  source: string;
}

export interface XCountEstimate {
  source: string;
  query: string;
  count?: number;
  error?: string;
}

let cachedAppOnlyBearerToken: string | undefined;

const X_EXPANSIONS = ['author_id', 'attachments.media_keys'];
const X_TWEET_FIELDS = [
  'attachments',
  'author_id',
  'conversation_id',
  'created_at',
  'entities',
  'in_reply_to_user_id',
  'public_metrics',
  'referenced_tweets',
  'lang',
];
const X_USER_FIELDS = [
  'description',
  'location',
  'name',
  'profile_image_url',
  'public_metrics',
  'username',
  'verified',
  'verified_type',
];
const X_MEDIA_FIELDS = [
  'alt_text',
  'duration_ms',
  'height',
  'media_key',
  'preview_image_url',
  'public_metrics',
  'type',
  'url',
  'variants',
  'width',
];

export function isXSearchConfigured(
  env: XSearchEnv = process.env
): boolean {
  return Boolean(
    env.X_API_KEY?.trim() &&
      env.X_API_KEY_SECRET?.trim() &&
      env.X_ACCESS_TOKEN?.trim() &&
      env.X_ACCESS_TOKEN_SECRET?.trim()
  );
}

export async function searchXViaOfficialApi(
  input: {
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxItems: number;
    maxQueries?: number;
    maxScannedPerQuery?: number;
    seenPostIds?: string[];
    seenPostUrls?: string[];
  },
  env: XSearchEnv = process.env
): Promise<PlatformScrapeResult> {
  if (!isXSearchConfigured(env)) {
    return {
      platform: 'x',
      posts: [],
      warnings: ['X official search not configured'],
      raw: {},
    };
  }

  const client = new TwitterApi({
    appKey: env.X_API_KEY!.trim(),
    appSecret: env.X_API_KEY_SECRET!.trim(),
    accessToken: env.X_ACCESS_TOKEN!.trim(),
    accessSecret: env.X_ACCESS_TOKEN_SECRET!.trim(),
  });

  const timeWindow = recentSearchWindow(input.windowStart, input.windowEnd);
  const queryPlan = buildXQueryPlan(input.querySet, input.maxQueries ?? 12);
  const seenTweetIds = new Set([
    ...(input.seenPostIds ?? []),
    ...(input.seenPostUrls ?? []).map(tweetIdFromUrl).filter((id): id is string => Boolean(id)),
  ]);
  const users = new Map<string, XUser>();
  const media = new Map<string, XMedia>();
  const tweetsById = new Map<string, XTweet>();
  const perQuery = Math.max(25, Math.ceil(input.maxItems / Math.max(1, Math.min(queryPlan.length, 4))));
  const rawQueries: Array<{
    source: string;
    query: string;
    count?: number;
    countError?: string;
    fetched: number;
    skippedSeen: number;
    scanned: number;
    meta?: Record<string, unknown>;
    error?: string;
  }> = [];
  const rawReplyQueries: Array<{
    rootId: string;
    query: string;
    fetched: number;
    skippedSeen: number;
    scanned: number;
    meta?: Record<string, unknown>;
    error?: string;
  }> = [];

  for (const plan of queryPlan) {
    if (tweetsById.size >= input.maxItems) break;
    let count: number | undefined;
    let countError: string | undefined;
    try {
      const counts = await countRecentPosts(plan.query, timeWindow, env);
      count = counts.count;
      countError = counts.error;
    } catch (err) {
      countError = err instanceof Error ? err.message : String(err);
      // Counts are advisory for planning only; search still carries the scrape.
    }

    try {
      const paginator = (await client.v2.search(plan.query, {
        max_results: Math.max(10, Math.min(100, perQuery)),
        expansions: X_EXPANSIONS,
        'tweet.fields': X_TWEET_FIELDS,
        'user.fields': X_USER_FIELDS,
        'media.fields': X_MEDIA_FIELDS,
        start_time: timeWindow.startTime,
        end_time: timeWindow.endTime,
      } as never)) as unknown as AsyncIterable<XTweet> & {
        includes?: { media?: XMedia[]; users?: XUser[] };
        meta?: Record<string, unknown>;
      };

      let fetched = 0;
      let skippedSeen = 0;
      let scanned = 0;
      const maxScanned = maxScannedPerQuery(input.maxScannedPerQuery, perQuery);
      for await (const tweet of paginator) {
        scanned += 1;
        if (seenTweetIds.has(tweet.id) || tweetsById.has(tweet.id)) {
          skippedSeen += 1;
          if (scanned >= maxScanned) break;
          continue;
        }
        tweetsById.set(tweet.id, tweet);
        fetched += 1;
        if (fetched >= perQuery || tweetsById.size >= input.maxItems || scanned >= maxScanned) break;
      }
      for (const user of paginator.includes?.users ?? []) users.set(user.id, user);
      for (const item of paginator.includes?.media ?? []) media.set(item.media_key, item);
      rawQueries.push({
        source: plan.source,
        query: plan.query,
        count,
        countError,
        fetched,
        skippedSeen,
        scanned,
        meta: paginator.meta,
      });
    } catch (err) {
      rawQueries.push({
        source: plan.source,
        query: plan.query,
        count,
        countError,
        fetched: 0,
        skippedSeen: 0,
        scanned: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (shouldFetchReplies(env) && tweetsById.size < input.maxItems) {
    const replyResults = await fetchRepliesForTopPosts({
      client,
      env,
      timeWindow,
      roots: Array.from(tweetsById.values()),
      media,
      users,
      seenTweetIds,
      maxItemsRemaining: input.maxItems - tweetsById.size,
    });
    rawReplyQueries.push(...replyResults.raw);
    for (const reply of replyResults.replies) tweetsById.set(reply.id, reply);
  }
  const tweets = Array.from(tweetsById.values()).slice(0, input.maxItems);

  return {
    platform: 'x',
    posts: tweets.map((tweet) => toEventPost(tweet, users, media, 'x-api')),
    warnings:
      tweets.length > 0
        ? []
        : [`X official search returned no posts for ${queryPlan.length} expansion queries`],
    raw: {
      queries: rawQueries,
      replyQueries: rawReplyQueries,
      timeWindow,
    },
  };
}

export async function lookupXPostsByIds(
  input: {
    tweetIds: string[];
    maxItems?: number;
  },
  env: XSearchEnv = process.env
): Promise<PlatformScrapeResult> {
  if (!isXSearchConfigured(env)) {
    return {
      platform: 'x',
      posts: [],
      warnings: ['X official lookup not configured'],
      raw: {},
    };
  }

  const client = new TwitterApi({
    appKey: env.X_API_KEY!.trim(),
    appSecret: env.X_API_KEY_SECRET!.trim(),
    accessToken: env.X_ACCESS_TOKEN!.trim(),
    accessSecret: env.X_ACCESS_TOKEN_SECRET!.trim(),
  });
  const tweetIds = dedupeTweetIds(input.tweetIds).slice(0, input.maxItems ?? input.tweetIds.length);
  const users = new Map<string, XUser>();
  const media = new Map<string, XMedia>();
  const tweetsById = new Map<string, XTweet>();
  const rawBatches: Array<{
    requested: number;
    fetched: number;
    errors?: unknown[];
    error?: string;
  }> = [];

  for (let index = 0; index < tweetIds.length; index += 100) {
    const batch = tweetIds.slice(index, index + 100);
    try {
      const result = (await client.v2.tweets(batch, {
        expansions: X_EXPANSIONS,
        'tweet.fields': X_TWEET_FIELDS,
        'user.fields': X_USER_FIELDS,
        'media.fields': X_MEDIA_FIELDS,
      } as never)) as unknown as {
        data?: XTweet[];
        includes?: { media?: XMedia[]; users?: XUser[] };
        errors?: unknown[];
      };
      for (const user of result.includes?.users ?? []) users.set(user.id, user);
      for (const item of result.includes?.media ?? []) media.set(item.media_key, item);
      for (const tweet of result.data ?? []) tweetsById.set(tweet.id, tweet);
      rawBatches.push({
        requested: batch.length,
        fetched: result.data?.length ?? 0,
        errors: result.errors?.length ? result.errors : undefined,
      });
    } catch (err) {
      rawBatches.push({
        requested: batch.length,
        fetched: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tweets = Array.from(tweetsById.values());
  return {
    platform: 'x',
    posts: tweets.map((tweet) => toEventPost(tweet, users, media, 'x-lookup')),
    warnings:
      tweets.length > 0
        ? []
        : [`X official lookup returned no posts for ${tweetIds.length} tweet IDs`],
    raw: {
      batches: rawBatches,
      requested: tweetIds.length,
      fetched: tweets.length,
    },
  };
}

async function fetchRepliesForTopPosts(input: {
  client: TwitterApi;
  env: XSearchEnv;
  timeWindow: { startTime: string; endTime: string };
  roots: XTweet[];
  media: Map<string, XMedia>;
  users: Map<string, XUser>;
  seenTweetIds: Set<string>;
  maxItemsRemaining: number;
}): Promise<{
  replies: XTweet[];
  raw: Array<{
    rootId: string;
    query: string;
    fetched: number;
    skippedSeen: number;
    scanned: number;
    meta?: Record<string, unknown>;
    error?: string;
  }>;
}> {
  const roots = input.roots
    .filter((tweet) => (tweet.public_metrics?.reply_count ?? 0) > 0)
    .sort((a, b) => (b.public_metrics?.reply_count ?? 0) - (a.public_metrics?.reply_count ?? 0))
    .slice(0, xReplyRootLimit(input.env));
  const repliesById = new Map<string, XTweet>();
  const raw: Array<{
    rootId: string;
    query: string;
    fetched: number;
    skippedSeen: number;
    scanned: number;
    meta?: Record<string, unknown>;
    error?: string;
  }> = [];
  const perRoot = xRepliesPerRoot(input.env);

  for (const root of roots) {
    if (repliesById.size >= input.maxItemsRemaining) break;
    const rootId = root.conversation_id ?? root.id;
    const query = `conversation_id:${rootId} -is:retweet`;
    try {
      const paginator = (await input.client.v2.search(query, {
        max_results: Math.max(10, Math.min(100, perRoot)),
        expansions: X_EXPANSIONS,
        'tweet.fields': X_TWEET_FIELDS,
        'user.fields': X_USER_FIELDS,
        'media.fields': X_MEDIA_FIELDS,
        start_time: input.timeWindow.startTime,
        end_time: input.timeWindow.endTime,
      } as never)) as unknown as AsyncIterable<XTweet> & {
        includes?: { media?: XMedia[]; users?: XUser[] };
        meta?: Record<string, unknown>;
      };

      let fetched = 0;
      let skippedSeen = 0;
      let scanned = 0;
      const maxScanned = maxScannedPerQuery(undefined, perRoot);
      for await (const tweet of paginator) {
        scanned += 1;
        if (tweet.id === root.id || input.seenTweetIds.has(tweet.id) || repliesById.has(tweet.id)) {
          skippedSeen += 1;
          if (scanned >= maxScanned) break;
          continue;
        }
        {
          repliesById.set(tweet.id, tweet);
          fetched += 1;
        }
        if (fetched >= perRoot || repliesById.size >= input.maxItemsRemaining || scanned >= maxScanned) break;
      }
      for (const user of paginator.includes?.users ?? []) input.users.set(user.id, user);
      for (const item of paginator.includes?.media ?? []) input.media.set(item.media_key, item);
      raw.push({ rootId, query, fetched, skippedSeen, scanned, meta: paginator.meta });
    } catch (err) {
      raw.push({
        rootId,
        query,
        fetched: 0,
        skippedSeen: 0,
        scanned: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { replies: Array.from(repliesById.values()), raw };
}

export function buildXQueryPlan(querySet: string[], limit = 12): XQueryPlan[] {
  const candidates = normalizeQuerySet(querySet, limit)
    .filter((query) => !query.toLowerCase().includes(' singapore singapore'))
    .map((query) => query.trim())
    .filter(Boolean);
  const planned = candidates.map((source) => ({
    source,
    query: toXSearchQuery(source),
  }));
  return dedupeQueryPlan(planned);
}

export async function countXRecentQueries(
  input: {
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxQueries?: number;
  },
  env: XSearchEnv = process.env
): Promise<{
  platform: 'x';
  windowStart: string;
  windowEnd: string;
  totalLowerBound: number;
  estimates: XCountEstimate[];
  warnings: string[];
}> {
  const timeWindow = recentSearchWindow(input.windowStart, input.windowEnd);
  const plan = buildXQueryPlan(input.querySet, input.maxQueries ?? 12);
  const estimates: XCountEstimate[] = [];
  for (const item of plan) {
    const result = await countRecentPosts(item.query, timeWindow, env);
    estimates.push({
      source: item.source,
      query: item.query,
      count: result.count,
      error: result.error,
    });
  }
  return {
    platform: 'x',
    windowStart: timeWindow.startTime,
    windowEnd: timeWindow.endTime,
    totalLowerBound: estimates.reduce((sum, estimate) => sum + (estimate.count ?? 0), 0),
    estimates,
    warnings: [
      'X recent counts are per-query volumes, not deduped corpus size; overlapping anchors can count the same post multiple times.',
      'X recent search/counts only cover the recent-search window available to the app.',
    ],
  };
}

async function countRecentPosts(
  query: string,
  timeWindow: { startTime: string; endTime: string },
  env: XSearchEnv
): Promise<{ count?: number; error?: string }> {
  const bearer = await getAppOnlyBearerToken(env);
  if (!bearer) return { error: 'X app-only bearer token unavailable' };

  const url = new URL('https://api.x.com/2/tweets/counts/recent');
  url.searchParams.set('query', query);
  url.searchParams.set('start_time', toXSecondTimestamp(timeWindow.startTime));
  url.searchParams.set('end_time', toXSecondTimestamp(timeWindow.endTime));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      error: `HTTP ${res.status}: ${text.slice(0, 240)}`,
    };
  }
  try {
    const json = JSON.parse(text) as { meta?: { total_tweet_count?: number } };
    return { count: json.meta?.total_tweet_count };
  } catch {
    return { error: 'X counts response was not JSON' };
  }
}

function toEventPost(
  tweet: XTweet,
  users: Map<string, XUser>,
  media: Map<string, XMedia>,
  mediaSource: string
) {
  const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
  const handle = user?.username;
  const url = handle
    ? `https://x.com/${handle}/status/${tweet.id}`
    : `https://twitter.com/i/web/status/${tweet.id}`;
  const metrics = tweet.public_metrics ?? {};
  const isReply = Boolean(tweet.in_reply_to_user_id || tweet.referenced_tweets?.some((ref) => ref.type === 'replied_to'));
  const tags = ['x-api'];
  if (isReply) tags.push('x-reply', 'conversation');
  if (tweet.conversation_id) tags.push(`conversation:${tweet.conversation_id}`);
  return {
    postId: makePostId('x', url, tweet.text),
    platform: 'x' as const,
    url,
    authorName: user?.name ?? handle ?? tweet.author_id ?? 'unknown',
    authorHandle: handle,
    authorUrl: handle ? `https://x.com/${handle}` : undefined,
    authorMeta: authorMetaFromXUser(user),
    text: tweet.text,
    postedAt: tweet.created_at,
    metrics: {
      likes: metrics.like_count,
      reposts: (metrics.retweet_count ?? 0) + (metrics.quote_count ?? 0),
      replies: metrics.reply_count,
      impressions: metrics.impression_count,
      views: metrics.impression_count,
    },
    media: mediaFromTweet(tweet, media, mediaSource),
    tags,
    raw: tweet,
  };
}

function authorMetaFromXUser(user?: XUser): EventAuthorMeta | undefined {
  if (!user) return undefined;
  const metrics = user.public_metrics ?? {};
  return {
    description: user.description,
    location: user.location,
    followers: metrics.followers_count,
    following: metrics.following_count,
    posts: metrics.tweet_count,
    listed: metrics.listed_count,
    verified: user.verified,
    verifiedType: user.verified_type,
    profileImageUrl: user.profile_image_url,
  };
}

function mediaFromTweet(
  tweet: XTweet,
  media: Map<string, XMedia>,
  source: string
): EventPostMedia[] | undefined {
  const items = (tweet.attachments?.media_keys ?? [])
    .map((key) => media.get(key))
    .filter((item): item is XMedia => Boolean(item))
    .map((item) => mediaItemFromXMedia(item, source))
    .filter((item) => item.url.length > 0);
  return items.length ? items : undefined;
}

function mediaItemFromXMedia(item: XMedia, source: string): EventPostMedia {
  const type = xMediaType(item.type);
  const variant = type === 'video' || type === 'gif' ? bestVideoVariant(item.variants) : undefined;
  return {
    url: variant?.url ?? item.url ?? item.preview_image_url ?? '',
    type,
    source,
    previewUrl: item.preview_image_url,
    altText: item.alt_text,
    width: item.width,
    height: item.height,
    contentType: variant?.contentType,
    durationMs: item.duration_ms,
    variants: mediaVariants(item.variants),
  };
}

type EventMediaVariant = NonNullable<EventPostMedia['variants']>[number];

function bestVideoVariant(variants?: XMediaVariant[]): EventMediaVariant | undefined {
  return mediaVariants(variants)
    ?.filter((variant) => variant.contentType === 'video/mp4')
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function mediaVariants(variants?: XMediaVariant[]): EventPostMedia['variants'] | undefined {
  const normalized = (variants ?? [])
    .map((variant) => ({
      url: variant.url?.trim() ?? '',
      contentType: variant.content_type,
      bitrate: variant.bit_rate,
    }))
    .filter((variant) => variant.url.length > 0);
  return normalized.length ? normalized : undefined;
}

function xMediaType(type?: string): EventPostMedia['type'] {
  if (type === 'photo') return 'image';
  if (type === 'video') return 'video';
  if (type === 'animated_gif') return 'gif';
  return 'unknown';
}

async function getAppOnlyBearerToken(env: XSearchEnv): Promise<string | undefined> {
  const existing = env.X_BEARER_TOKEN?.trim() || env.X_APP_BEARER_TOKEN?.trim();
  if (existing) return existing;
  if (cachedAppOnlyBearerToken) return cachedAppOnlyBearerToken;

  const key = env.X_API_KEY?.trim();
  const secret = env.X_API_KEY_SECRET?.trim();
  if (!key || !secret) return undefined;

  const basic = Buffer.from(`${encodeURIComponent(key)}:${encodeURIComponent(secret)}`).toString(
    'base64'
  );
  const res = await fetch('https://api.x.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { access_token?: string };
  cachedAppOnlyBearerToken = json.access_token;
  return cachedAppOnlyBearerToken;
}

function shouldFetchReplies(env: XSearchEnv): boolean {
  return env.EVENT_RECAP_X_FETCH_REPLIES !== '0';
}

function xReplyRootLimit(env: XSearchEnv): number {
  const raw = Number(env.EVENT_RECAP_X_REPLY_ROOTS ?? 8);
  if (!Number.isFinite(raw)) return 8;
  return Math.max(0, Math.min(25, Math.round(raw)));
}

function xRepliesPerRoot(env: XSearchEnv): number {
  const raw = Number(env.EVENT_RECAP_X_REPLIES_PER_ROOT ?? 25);
  if (!Number.isFinite(raw)) return 25;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function maxScannedPerQuery(value: number | undefined, perQuery: number): number {
  const fallback = perQuery * 4;
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(perQuery, Math.min(1000, Math.round(raw)));
}

function tweetIdFromUrl(url: string): string | undefined {
  return url.match(/\/status\/(\d+)/)?.[1];
}

function dedupeTweetIds(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const id = value.trim().match(/\d{5,}/)?.[0];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function toXSecondTimestamp(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toXSearchQuery(source: string): string {
  const handle = source.match(/^@([A-Za-z0-9_]{2,30})(?:\s+(.+))?$/);
  if (handle) {
    const rest = handle[2]?.trim();
    const context = rest && !/^singapore$/i.test(rest) ? quoteIfPlain(rest) : '(Singapore OR "AI Engineer")';
    return `(@${handle[1]} OR from:${handle[1]}) ${context} -is:retweet`;
  }
  const hashtag = source.match(/^(#[A-Za-z][A-Za-z0-9_]{2,40})(?:\s+(.+))?$/);
  if (hashtag) {
    const rest = hashtag[2]?.trim();
    return `${hashtag[1]} ${rest ? quoteIfPlain(rest) : '(Singapore OR "AI Engineer")'} -is:retweet`;
  }
  if (source.includes('"') || /\b(OR|from:|url:|has:|is:|lang:)\b/i.test(source)) {
    return `${source} -is:retweet`;
  }
  return `${quoteIfPlain(source)} -is:retweet`;
}

function quoteIfPlain(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return compact;
  if (compact.startsWith('"') || compact.startsWith('(')) return compact;
  if (/^[#@]/.test(compact)) return compact;
  if (/\s/.test(compact)) return `"${compact}"`;
  return compact;
}

function dedupeQueryPlan(plans: XQueryPlan[]): XQueryPlan[] {
  const seen = new Set<string>();
  const out: XQueryPlan[] = [];
  for (const plan of plans) {
    const key = plan.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(plan);
  }
  return out;
}

export function isRecentSearchWindowReachable(windowEnd: string, now = new Date()): boolean {
  const end = Date.parse(windowEnd);
  if (!Number.isFinite(end)) return true;
  return end >= now.getTime() - 6.9 * 24 * 60 * 60 * 1000;
}

export function recentSearchWindow(
  windowStart: string,
  windowEnd: string,
  now = new Date()
): { startTime: string; endTime: string } {
  const latestAllowedEnd = new Date(now.getTime() - 30_000);
  const sevenDaysAgo = new Date(now.getTime() - 6.9 * 24 * 60 * 60 * 1000);
  const requestedStart = new Date(windowStart);
  const requestedEnd = new Date(windowEnd);
  const start =
    Number.isNaN(requestedStart.getTime()) || requestedStart < sevenDaysAgo
      ? sevenDaysAgo
      : requestedStart;
  const end =
    Number.isNaN(requestedEnd.getTime()) || requestedEnd > latestAllowedEnd
      ? latestAllowedEnd
      : requestedEnd;
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}
