import type {
  EventPlatform,
  EventResolution,
  PlatformScrapeResult,
} from './types';
import { deriveSeedFrontier } from './frontier';
import { makePostId, normalizeQuerySet } from './utils';

const SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai';
const FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai';
const AGENT_SSE_ENDPOINT = 'https://agent.tinyfish.ai/v1/automation/run-sse';

type Fetcher = typeof fetch;

interface TinyFishSearchResult {
  title?: string;
  snippet?: string;
  url?: string;
  site_name?: string;
}

interface TinyFishSearchResponse {
  query?: string;
  results?: TinyFishSearchResult[];
}

interface TinyFishFetchResponse {
  results?: Array<{
    url?: string;
    final_url?: string;
    title?: string;
    description?: string;
    text?: string | object;
  }>;
  errors?: unknown[];
}

interface TinyFishCompleteEvent {
  type: 'COMPLETE';
  status?: string;
  result?: unknown;
  error?: unknown;
  help_message?: string;
}

interface TinyFishStreamingEvent {
  type: 'STREAMING_URL';
  streaming_url?: string;
}

type TinyFishSseEvent =
  | TinyFishCompleteEvent
  | TinyFishStreamingEvent
  | { type?: string; [key: string]: unknown };

interface ScrapedPostPayload {
  url?: string;
  author_name?: string;
  authorName?: string;
  author_handle?: string;
  authorHandle?: string;
  author_url?: string;
  authorUrl?: string;
  author_headline?: string;
  authorHeadline?: string;
  author_location?: string;
  authorLocation?: string;
  author_followers?: number;
  authorFollowers?: number;
  author_description?: string;
  authorDescription?: string;
  text?: string;
  posted_at?: string;
  postedAt?: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  comments?: number;
  reactions?: number;
  impressions?: number;
  views?: number;
  tags?: string[];
  comments_list?: ScrapedCommentPayload[];
  commentsList?: ScrapedCommentPayload[];
  visible_comments?: ScrapedCommentPayload[];
  visibleComments?: ScrapedCommentPayload[];
}

interface ScrapedCommentPayload {
  url?: string;
  author_name?: string;
  authorName?: string;
  author_handle?: string;
  authorHandle?: string;
  author_url?: string;
  authorUrl?: string;
  author_headline?: string;
  authorHeadline?: string;
  text?: string;
  posted_at?: string;
  postedAt?: string;
  likes?: number;
  reactions?: number;
}

function apiKey(): string {
  const key = process.env.TINYFISH_API_KEY?.trim();
  if (!key && process.env.NODE_ENV === 'test') return 'test-tinyfish-key';
  if (!key) throw new Error('TINYFISH_API_KEY is not set');
  return key;
}

export async function resolveEventViaTinyFish(
  input: { name: string; contextHint?: string },
  fetcher: Fetcher = fetch
): Promise<EventResolution> {
  const query = `${input.name} Singapore event date official ${input.contextHint ?? ''}`.trim();
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('location', 'SG');
  searchUrl.searchParams.set('language', 'en');

  const searchRes = await fetcher(searchUrl, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!searchRes.ok) {
    throw new Error(`TinyFish Search failed: HTTP ${searchRes.status}`);
  }
  const searchJson = (await searchRes.json()) as TinyFishSearchResponse;
  const topResults = (searchJson.results ?? []).slice(0, 5);
  const urls = topResults
    .map((result) => result.url)
    .filter((url): url is string => Boolean(url));

  const fetched = urls.length
    ? await fetchEventPages(urls.slice(0, 3), fetcher).catch(() => null)
    : null;
  const text = [
    ...topResults.map((result) => `${result.title ?? ''}\n${result.snippet ?? ''}`),
    ...(fetched?.results ?? []).map((page) =>
      typeof page.text === 'string' ? `${page.title ?? ''}\n${page.text.slice(0, 3000)}` : ''
    ),
  ].join('\n\n');
  const dates = inferDateRange(text);

  return {
    canonicalName: inferName(input.name, topResults),
    officialUrl: urls[0],
    location: inferLocation(text) ?? 'Singapore',
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    querySet: deriveSeedFrontier({
      eventName: input.name,
      contextHint: input.contextHint,
      officialUrl: urls[0],
      sourceUrls: urls,
    }).querySet,
    sourceUrls: urls,
    warnings: fetched?.errors?.length
      ? [`TinyFish Fetch returned ${fetched.errors.length} page errors`]
      : [],
  };
}

async function fetchEventPages(
  urls: string[],
  fetcher: Fetcher
): Promise<TinyFishFetchResponse> {
  const res = await fetcher(FETCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
    },
    body: JSON.stringify({ urls, format: 'markdown', links: true }),
  });
  if (!res.ok) throw new Error(`TinyFish Fetch failed: HTTP ${res.status}`);
  return (await res.json()) as TinyFishFetchResponse;
}

export async function scrapePlatformViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxItems: number;
    credentialItemIds?: string[];
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const goal = buildScrapeGoal(input);
  const payload: Record<string, unknown> = {
    url: platformSearchUrl(input.platform, input.querySet),
    goal,
    browser_profile: 'stealth',
    use_vault: input.platform === 'linkedin',
  };
  if (process.env.TINYFISH_USE_OUTPUT_SCHEMA === '1') {
    payload.output_schema = postOutputSchema(input.maxItems);
  }

  const proxyCountry = process.env.TINYFISH_PROXY_COUNTRY?.trim();
  if (proxyCountry) {
    payload.proxy_config = {
      enabled: true,
      type: 'tetra',
      country_code: proxyCountry,
    };
  }
  if (input.platform === 'linkedin' && input.credentialItemIds?.length) {
    payload.credential_item_ids = input.credentialItemIds;
  }

  const events = await runSse(payload, fetcher);
  const complete = events.find(
    (event): event is TinyFishCompleteEvent => event.type === 'COMPLETE'
  );
  const streaming = events.find(
    (event): event is TinyFishStreamingEvent => event.type === 'STREAMING_URL'
  );
  if (!complete) throw new Error('TinyFish Agent stream ended without COMPLETE');
  if (complete.status && complete.status !== 'COMPLETED') {
    throw new Error(
      complete.help_message ||
        `TinyFish Agent ${input.platform} run failed: ${JSON.stringify(complete.error)}`
    );
  }

  const posts = normalizeTinyFishPosts(input.platform, complete.result);
  return {
    platform: input.platform,
    posts: posts.slice(0, input.maxItems),
    streamingUrl: streaming?.streaming_url,
    warnings: posts.length === 0 ? [`TinyFish returned no ${input.platform} posts`] : [],
    raw: complete.result,
  };
}

export async function scrapePlatformFrontierViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxItems: number;
    credentialItemIds?: string[];
    maxQueries?: number;
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 4);
  const maxPerQuery = Math.max(10, Math.ceil(input.maxItems / Math.max(1, Math.min(queries.length, 4))));
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  const streamingUrls: string[] = [];
  const warnings: string[] = [];
  const rawQueries: unknown[] = [];

  for (const query of queries) {
    if (byUrl.size >= input.maxItems) break;
    const result = await scrapePlatformViaTinyFish(
      {
        platform: input.platform,
        querySet: [query],
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        maxItems: maxPerQuery,
        credentialItemIds: input.credentialItemIds,
      },
      fetcher
    );
    if (result.streamingUrl) streamingUrls.push(result.streamingUrl);
    warnings.push(...result.warnings.map((warning) => `${query}: ${warning}`));
    rawQueries.push({ query, raw: result.raw, posts: result.posts.length });
    for (const post of result.posts) byUrl.set(post.url, post);
  }

  return {
    platform: input.platform,
    posts: Array.from(byUrl.values()).slice(0, input.maxItems),
    streamingUrl: streamingUrls[0],
    warnings,
    raw: { queries: rawQueries, streamingUrls },
  };
}

export async function searchPlatformFallbackViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    maxItems: number;
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const query = platformSearchFallbackQuery(input.platform, input.querySet);
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('location', 'SG');
  searchUrl.searchParams.set('language', 'en');

  const searchRes = await fetcher(searchUrl, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!searchRes.ok) {
    throw new Error(`TinyFish Search fallback failed: HTTP ${searchRes.status}`);
  }
  const searchJson = (await searchRes.json()) as TinyFishSearchResponse;
  const results = (searchJson.results ?? [])
    .filter((result) => isPlatformPostUrl(input.platform, result.url))
    .slice(0, input.maxItems);

  return {
    platform: input.platform,
    posts: results.map((result) => {
      const text = result.snippet?.trim() || result.title?.trim() || '';
      const url = result.url as string;
      return {
        postId: makePostId(input.platform, url, text),
        platform: input.platform,
        url,
        authorName: authorFromSearchResult(input.platform, result),
        authorHandle: handleFromUrl(input.platform, url),
        authorUrl: profileUrlFromPostUrl(input.platform, url),
        text,
        metrics: {},
        tags: ['search-fallback'],
        raw: result,
      };
    }),
    warnings: [
      `TinyFish Agent could not access ${input.platform} posts directly; used Search API snippets as cited fallback`,
    ],
    raw: searchJson,
  };
}

export async function countPlatformViaTinyFishSearch(
  input: {
    platform: EventPlatform;
    querySet: string[];
    maxQueries?: number;
  },
  fetcher: Fetcher = fetch
): Promise<{
  platform: EventPlatform;
  estimates: Array<{ source: string; query: string; count: number; urls: string[]; error?: string }>;
  totalLowerBound: number;
  warnings: string[];
}> {
  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 8);
  const estimates: Array<{ source: string; query: string; count: number; urls: string[]; error?: string }> = [];
  for (const source of queries) {
    const variants = platformCountQueries(input.platform, source);
    const urls = new Set<string>();
    const errors: string[] = [];
    for (const query of variants) {
      const searchUrl = new URL(SEARCH_ENDPOINT);
      searchUrl.searchParams.set('query', query);
      searchUrl.searchParams.set('location', 'SG');
      searchUrl.searchParams.set('language', 'en');
      try {
        const res = await fetcher(searchUrl, { headers: { 'X-API-Key': apiKey() } });
        if (!res.ok) {
          errors.push(`${query}: HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as TinyFishSearchResponse;
        for (const url of (json.results ?? [])
          .map((result) => result.url)
          .filter((url): url is string => Boolean(url))
          .filter((url) => isPlatformPostUrl(input.platform, url))) {
          urls.add(url);
        }
      } catch (err) {
        errors.push(`${query}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    estimates.push({
      source,
      query: variants.join(' || '),
      count: urls.size,
      urls: Array.from(urls),
      error: errors.length ? errors.join(' | ') : undefined,
    });
  }
  return {
    platform: input.platform,
    estimates,
    totalLowerBound: new Set(estimates.flatMap((estimate) => estimate.urls)).size,
    warnings: [
      `${input.platform} TinyFish Search counts are indexed-public URL estimates, not platform-total counts.`,
      'Search-index results are biased toward public, indexed, and high-ranking posts; use browser scraping for recall.',
    ],
  };
}

function platformCountQueries(platform: EventPlatform, source: string): string[] {
  if (platform !== 'linkedin') return [platformSearchFallbackQuery(platform, [source])];

  const stripped = source
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const quoted = stripped.startsWith('"') ? stripped : `"${stripped}"`;
  const withoutQuotes = stripped.replace(/"/g, '');
  return normalizeQuerySet([
    `site:linkedin.com/posts ${quoted}`,
    `linkedin posts ${quoted}`,
    withoutQuotes ? `site:linkedin.com/posts ${withoutQuotes}` : '',
  ], 3);
}

async function runSse(
  payload: Record<string, unknown>,
  fetcher: Fetcher
): Promise<TinyFishSseEvent[]> {
  const res = await fetcher(AGENT_SSE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `TinyFish Agent SSE failed: HTTP ${res.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ''}`
    );
  }
  const body = await res.text();
  const events: TinyFishSseEvent[] = [];
  for (const block of body.split(/\n\n+/)) {
    const dataLine = block
      .split(/\n/)
      .find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const json = dataLine.replace(/^data:\s*/, '').trim();
    if (!json) continue;
    try {
      events.push(JSON.parse(json) as TinyFishSseEvent);
    } catch {
      // Ignore malformed progress chunks; COMPLETE still determines success.
    }
  }
  return events;
}

function buildScrapeGoal(input: {
  platform: EventPlatform;
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
}): string {
  const label = input.platform === 'x' ? 'X/Twitter' : 'LinkedIn';
  return [
    `Search ${label} public posts for this event recap corpus.`,
    `Queries: ${input.querySet.join(' | ')}`,
    `Only include posts about the event or "AI engineer Singapore" conversation, posted from ${input.windowStart} through ${input.windowEnd}.`,
    `Return at most ${input.maxItems} posts.`,
    'Exclude job ads, generic hiring spam, profile-only matches, and duplicate reposts unless the repost text adds new commentary.',
    'Return ONLY valid JSON shaped as {"posts":[...]} with no markdown wrapper.',
    'For each post include url, author_name, author_handle, author_url, author_headline, author_location, author_followers, text, posted_at, likes/reposts/replies/comments/reactions/impressions/views when visible, and tags.',
    input.platform === 'linkedin'
      ? 'When a post has visible comments, include up to 5 substantive attendee comments in comments_list with author_name, author_handle, author_url, author_headline, text, posted_at, likes/reactions. Avoid generic congratulations-only comments.'
      : 'Prefer posts with visible reach or engagement, but keep a mix of high-reach voices and useful niche commentary.',
    'Prefer attendee reactions, questions, critiques, takeaways, and useful resources over announcements.',
  ].join('\n');
}

function platformSearchUrl(platform: EventPlatform, querySet: string[]): string {
  const q = encodeURIComponent(querySet.slice(0, 3).join(' OR '));
  if (platform === 'x') return `https://x.com/search?q=${q}&src=typed_query&f=live`;
  return `https://www.linkedin.com/search/results/content/?keywords=${q}`;
}

function platformSearchFallbackQuery(platform: EventPlatform, querySet: string[]): string {
  const quotedEvent = querySet.find((query) => query.startsWith('"')) ?? `"${querySet[0] ?? ''}"`;
  if (platform === 'x') return `site:x.com ${quotedEvent}`;
  return `site:linkedin.com/posts ${quotedEvent}`;
}

function isPlatformPostUrl(platform: EventPlatform, url?: string): boolean {
  if (!url) return false;
  if (platform === 'x') return /^https:\/\/x\.com\/[^/]+\/status\/\d+/i.test(url);
  return /^https:\/\/(?:www\.)?linkedin\.com\/posts\//i.test(url);
}

function authorFromSearchResult(
  platform: EventPlatform,
  result: TinyFishSearchResult
): string {
  const title = result.title?.trim();
  if (!title) return handleFromUrl(platform, result.url ?? '') ?? 'unknown';
  if (platform === 'linkedin') return title.split(' - LinkedIn')[0]?.trim() || title;
  return title.split(' on X')[0]?.trim() || handleFromUrl(platform, result.url ?? '') || title;
}

function handleFromUrl(platform: EventPlatform, url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (platform === 'x') return parsed.pathname.split('/').filter(Boolean)[0];
    if (platform === 'linkedin') return parsed.pathname.split('/')[2]?.split('_')[0];
  } catch {
    return undefined;
  }
  return undefined;
}

function profileUrlFromPostUrl(platform: EventPlatform, url: string): string | undefined {
  const handle = handleFromUrl(platform, url);
  if (!handle) return undefined;
  if (platform === 'x') return `https://x.com/${handle}`;
  return `https://www.linkedin.com/in/${handle}/`;
}

function postOutputSchema(maxItems: number) {
  return {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            author_name: { type: 'string' },
            author_handle: { type: 'string' },
            author_url: { type: 'string' },
            author_headline: { type: 'string' },
            author_location: { type: 'string' },
            author_followers: { type: 'number' },
            text: { type: 'string' },
            posted_at: { type: 'string' },
            likes: { type: 'number' },
            reposts: { type: 'number' },
            replies: { type: 'number' },
            comments: { type: 'number' },
            reactions: { type: 'number' },
            impressions: { type: 'number' },
            views: { type: 'number' },
            tags: { type: 'array', items: { type: 'string' } },
            comments_list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  author_name: { type: 'string' },
                  author_handle: { type: 'string' },
                  author_url: { type: 'string' },
                  author_headline: { type: 'string' },
                  text: { type: 'string' },
                  posted_at: { type: 'string' },
                  likes: { type: 'number' },
                  reactions: { type: 'number' },
                },
              },
            },
          },
          required: ['url', 'author_name', 'text'],
        },
      },
    },
    required: ['posts'],
  };
}

export function normalizeTinyFishPosts(platform: EventPlatform, value: unknown) {
  const parsed = parseResultObject(value);
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const posts = Array.isArray(record.posts) ? record.posts : [];
  return posts
    .filter((post): post is ScrapedPostPayload => Boolean(post && typeof post === 'object'))
    .flatMap((post) => {
      const text = stringValue(post.text);
      const url = stringValue(post.url) || platformSearchUrl(platform, [text.slice(0, 60)]);
      const authorName = stringValue(post.author_name ?? post.authorName) || 'unknown';
      const baseTags = Array.isArray(post.tags)
        ? post.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      const normalized = [{
        postId: makePostId(platform, url, text),
        platform,
        url,
        authorName,
        authorHandle: stringValue(post.author_handle ?? post.authorHandle) || undefined,
        authorUrl: stringValue(post.author_url ?? post.authorUrl) || undefined,
        authorMeta: {
          headline: stringValue(post.author_headline ?? post.authorHeadline) || undefined,
          location: stringValue(post.author_location ?? post.authorLocation) || undefined,
          followers: numberValue(post.author_followers ?? post.authorFollowers),
          description: stringValue(post.author_description ?? post.authorDescription) || undefined,
        },
        text,
        postedAt: stringValue(post.posted_at ?? post.postedAt) || undefined,
        metrics: {
          likes: numberValue(post.likes),
          reposts: numberValue(post.reposts),
          replies: numberValue(post.replies),
          comments: numberValue(post.comments),
          reactions: numberValue(post.reactions),
          impressions: numberValue(post.impressions),
          views: numberValue(post.views),
        },
        tags: baseTags,
        raw: post,
      }];
      const comments = commentList(post)
        .map((comment, index) => normalizeTinyFishComment(platform, url, comment, index))
        .filter((comment) => comment.text.length > 0);
      return [...normalized, ...comments];
    })
    .filter((post) => post.text.length > 0);
}

function commentList(post: ScrapedPostPayload): ScrapedCommentPayload[] {
  const value = post.comments_list ?? post.commentsList ?? post.visible_comments ?? post.visibleComments;
  return Array.isArray(value) ? value.filter((comment) => Boolean(comment && typeof comment === 'object')) : [];
}

function normalizeTinyFishComment(
  platform: EventPlatform,
  parentUrl: string,
  comment: ScrapedCommentPayload,
  index: number
) {
  const text = stringValue(comment.text);
  const url = stringValue(comment.url) || `${parentUrl}#comment-${index + 1}-${makePostId(platform, parentUrl, text)}`;
  const authorName = stringValue(comment.author_name ?? comment.authorName) || 'unknown';
  return {
    postId: makePostId(platform, url, text),
    platform,
    url,
    authorName,
    authorHandle: stringValue(comment.author_handle ?? comment.authorHandle) || undefined,
    authorUrl: stringValue(comment.author_url ?? comment.authorUrl) || undefined,
    authorMeta: {
      headline: stringValue(comment.author_headline ?? comment.authorHeadline) || undefined,
    },
    text,
    postedAt: stringValue(comment.posted_at ?? comment.postedAt) || undefined,
    metrics: {
      likes: numberValue(comment.likes),
      reactions: numberValue(comment.reactions),
    },
    tags: [`${platform}-comment`, 'comment', 'conversation'],
    raw: comment,
  };
}

function parseResultObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function inferName(fallback: string, results: TinyFishSearchResult[]): string {
  const title = results.find((result) => result.title)?.title;
  if (!title) return fallback;
  return title.split(/[|–-]/)[0]?.trim() || fallback;
}

function inferLocation(text: string): string | undefined {
  return /\bSingapore\b/i.test(text) ? 'Singapore' : undefined;
}

function inferDateRange(text: string): { startsAt?: string; endsAt?: string } {
  const range = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (range) {
    const month = range[1];
    const startDay = Number(range[2]);
    const endDay = Number(range[3]);
    const year = range[4];
    const startsAt = parseDate(`${month} ${startDay}, ${year}`);
    const endsAt = parseDate(`${month} ${endDay}, ${year}`);
    return { startsAt, endsAt };
  }

  const single = inferIsoDate(text);
  return { startsAt: single, endsAt: single };
}

function inferIsoDate(text: string): string | undefined {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return new Date(`${iso}T00:00:00.000Z`).toISOString();
  const longDate = text.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i
  )?.[0];
  if (!longDate) return undefined;
  return parseDate(longDate);
}

function parseDate(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
