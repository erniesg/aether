import { TwitterApi } from 'twitter-api-v2';
import type { PlatformScrapeResult } from './types';
import { makePostId, normalizeQuerySet } from './utils';

type XSearchEnv = Partial<Record<string, string | undefined>>;

interface XUser {
  id: string;
  name?: string;
  username?: string;
}

interface XTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
  lang?: string;
}

interface XQueryPlan {
  query: string;
  source: string;
}

let cachedAppOnlyBearerToken: string | undefined;

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
  const queryPlan = buildXQueryPlan(input.querySet);
  const users = new Map<string, XUser>();
  const tweetsById = new Map<string, XTweet>();
  const perQuery = Math.max(25, Math.ceil(input.maxItems / Math.max(1, Math.min(queryPlan.length, 4))));
  const rawQueries: Array<{
    source: string;
    query: string;
    count?: number;
    countError?: string;
    fetched: number;
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
        expansions: ['author_id'],
        'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'lang'],
        'user.fields': ['name', 'username', 'verified'],
        start_time: timeWindow.startTime,
        end_time: timeWindow.endTime,
      } as never)) as unknown as AsyncIterable<XTweet> & {
        includes?: { users?: XUser[] };
        meta?: Record<string, unknown>;
      };

      let fetched = 0;
      for await (const tweet of paginator) {
        tweetsById.set(tweet.id, tweet);
        fetched += 1;
        if (fetched >= perQuery || tweetsById.size >= input.maxItems) break;
      }
      for (const user of paginator.includes?.users ?? []) users.set(user.id, user);
      rawQueries.push({
        source: plan.source,
        query: plan.query,
        count,
        countError,
        fetched,
        meta: paginator.meta,
      });
    } catch (err) {
      rawQueries.push({
        source: plan.source,
        query: plan.query,
        count,
        countError,
        fetched: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const tweets = Array.from(tweetsById.values()).slice(0, input.maxItems);

  return {
    platform: 'x',
    posts: tweets.map((tweet) => {
      const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
      const handle = user?.username;
      const url = handle
        ? `https://x.com/${handle}/status/${tweet.id}`
        : `https://twitter.com/i/web/status/${tweet.id}`;
      const metrics = tweet.public_metrics ?? {};
      return {
        postId: makePostId('x', url, tweet.text),
        platform: 'x',
        url,
        authorName: user?.name ?? handle ?? tweet.author_id ?? 'unknown',
        authorHandle: handle,
        authorUrl: handle ? `https://x.com/${handle}` : undefined,
        text: tweet.text,
        postedAt: tweet.created_at,
        metrics: {
          likes: metrics.like_count,
          reposts: (metrics.retweet_count ?? 0) + (metrics.quote_count ?? 0),
          replies: metrics.reply_count,
          impressions: metrics.impression_count,
          views: metrics.impression_count,
        },
        tags: ['x-api'],
        raw: tweet,
      };
    }),
    warnings:
      tweets.length > 0
        ? []
        : [`X official search returned no posts for ${queryPlan.length} expansion queries`],
    raw: {
      queries: rawQueries,
      timeWindow,
    },
  };
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
