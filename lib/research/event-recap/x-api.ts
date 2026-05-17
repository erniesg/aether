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

  const query = buildXQuery(input.querySet);
  const timeWindow = recentSearchWindow(input.windowStart, input.windowEnd);
  const paginator = (await client.v2.search(query, {
    max_results: Math.max(10, Math.min(100, input.maxItems)),
    expansions: ['author_id'],
    'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'lang'],
    'user.fields': ['name', 'username', 'verified'],
    start_time: timeWindow.startTime,
    end_time: timeWindow.endTime,
  } as never)) as unknown as AsyncIterable<XTweet> & {
    includes?: { users?: XUser[] };
    meta?: Record<string, unknown>;
  };

  const users = new Map<string, XUser>();
  for (const user of paginator.includes?.users ?? []) users.set(user.id, user);

  const tweets: XTweet[] = [];
  for await (const tweet of paginator) {
    tweets.push(tweet);
    if (tweets.length >= input.maxItems) break;
  }

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
        : [`X official search returned no posts for query: ${query}`],
    raw: {
      query,
      timeWindow,
      meta: paginator.meta,
    },
  };
}

function buildXQuery(querySet: string[]): string {
  const candidates = normalizeQuerySet(querySet)
    .filter((query) => !query.toLowerCase().includes(' singapore singapore'))
    .slice(0, 5);
  const quoted = candidates
    .filter((query) => query.startsWith('"') || query.startsWith('#'))
    .slice(0, 4);
  const terms = quoted.length ? quoted : candidates.slice(0, 3);
  return `${terms.join(' OR ')} -is:retweet`;
}

function recentSearchWindow(
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
