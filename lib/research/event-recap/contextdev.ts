import type { PlatformScrapeResult } from './types';
import { bestDisplayAuthorName, makePostId, normalizeQuerySet } from './utils';

// ---------------------------------------------------------------------------
// Context.dev (https://context.dev) — web search + scrape provider.
//
// Unlike the official X API (7-day recent-search window), Context.dev search
// accepts Google-style `after:`/`before:` operators, so it can backfill posts
// for events that ended months ago. It returns whatever the web index holds:
// treat results as a lower-bound sample with no engagement metrics.
// ---------------------------------------------------------------------------

type ContextDevEnv = Partial<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

const SEARCH_URL = 'https://api.context.dev/v1/web/search';
const SCRAPE_MARKDOWN_URL = 'https://api.context.dev/v1/web/scrape/markdown';

export type ContextDevPlatform = 'x' | 'linkedin';

export interface ContextDevSearchInput {
  platform: ContextDevPlatform;
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
  maxQueries?: number;
  seenPostUrls?: string[];
}

interface ContextDevSearchResult {
  url?: string;
  title?: string;
  description?: string;
  relevance?: string;
  markdown?: { markdown?: string | null; code?: string };
}

interface ContextDevSearchResponse {
  results?: ContextDevSearchResult[];
  query?: string;
  key_metadata?: { credits_consumed?: number; credits_remaining?: number };
}

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

export function isContextDevConfigured(env: ContextDevEnv = process.env): boolean {
  return Boolean(env.CONTEXT_DEV_API_KEY?.trim() || env.CONTEXT_API_KEY?.trim());
}

function apiKey(env: ContextDevEnv): string | undefined {
  return env.CONTEXT_DEV_API_KEY?.trim() || env.CONTEXT_API_KEY?.trim() || undefined;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const PLATFORM_DOMAINS: Record<ContextDevPlatform, string[]> = {
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
};

export async function searchPlatformViaContextDev(
  input: ContextDevSearchInput,
  env: ContextDevEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const key = apiKey(env);
  if (!key) {
    return {
      platform: input.platform,
      posts: [],
      warnings: ['Context.dev API key is not configured'],
      raw: {},
    };
  }

  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 6);
  const seenUrls = new Set((input.seenPostUrls ?? []).map((url) => postUrlKey(url)));
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  const warnings: string[] = [];
  let itemsReturned = 0;
  let skippedSeen = 0;
  let skippedInvalid = 0;
  let creditsConsumed = 0;

  for (const query of queries) {
    if (byUrl.size >= input.maxItems) break;

    const body = {
      query: dateBoundedQuery(query, input.windowStart, input.windowEnd),
      numResults: clampNumResults(input.maxItems - byUrl.size),
      includeDomains: PLATFORM_DOMAINS[input.platform],
      markdownOptions: { enabled: true, useMainContentOnly: true },
    };

    let response: Response;
    try {
      response = await fetcher(SEARCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Context.dev query "${query}" failed: ${message}`);
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Context.dev search failed: HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    let parsed: ContextDevSearchResponse;
    try {
      parsed = JSON.parse(text) as ContextDevSearchResponse;
    } catch {
      warnings.push(`Context.dev query "${query}" returned non-JSON response`);
      continue;
    }

    creditsConsumed += numberValue(parsed.key_metadata?.credits_consumed) ?? 0;
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    itemsReturned += results.length;

    for (const result of results) {
      if (byUrl.size >= input.maxItems) break;
      const post = normalizeResult(input.platform, result);
      if (!post) {
        skippedInvalid += 1;
        continue;
      }
      const urlKey = postUrlKey(post.url);
      if (seenUrls.has(urlKey)) {
        skippedSeen += 1;
        continue;
      }
      if (byUrl.has(urlKey)) continue;
      byUrl.set(urlKey, post);
    }
  }

  if (itemsReturned > 0 && byUrl.size === 0 && skippedInvalid > 0) {
    warnings.push(
      `Context.dev returned ${itemsReturned} results, but none were post permalinks; broaden the query set or scrape source pages directly.`
    );
  }

  return {
    platform: input.platform,
    posts: Array.from(byUrl.values()),
    warnings,
    raw: {
      queries,
      itemsReturned,
      itemsCollected: byUrl.size,
      skippedSeen,
      skippedInvalid,
      creditsConsumed,
    },
  };
}

// ---------------------------------------------------------------------------
// Scrape (permalink / source-page enrichment)
// ---------------------------------------------------------------------------

export interface ContextDevScrapeResult {
  url: string;
  markdown?: string;
  warnings: string[];
}

export async function scrapeUrlViaContextDev(
  url: string,
  env: ContextDevEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<ContextDevScrapeResult> {
  const key = apiKey(env);
  if (!key) {
    return { url, warnings: ['Context.dev API key is not configured'] };
  }

  const requestUrl = `${SCRAPE_MARKDOWN_URL}?url=${encodeURIComponent(url)}`;
  let response: Response;
  try {
    response = await fetcher(requestUrl, {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, warnings: [`Context.dev scrape failed: ${message}`] };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      url,
      warnings: [`Context.dev scrape failed: HTTP ${response.status}: ${text.slice(0, 300)}`],
    };
  }

  try {
    const parsed = JSON.parse(text) as { success?: boolean; markdown?: string };
    return {
      url,
      markdown: typeof parsed.markdown === 'string' ? parsed.markdown : undefined,
      warnings: [],
    };
  } catch {
    return { url, warnings: ['Context.dev scrape returned non-JSON response'] };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dateBoundedQuery(query: string, windowStart: string, windowEnd: string): string {
  const parts = [query];
  const after = isoDateOnly(windowStart, -1);
  const before = isoDateOnly(windowEnd, 1);
  if (after) parts.push(`after:${after}`);
  if (before) parts.push(`before:${before}`);
  return parts.join(' ');
}

function clampNumResults(remaining: number): number {
  return Math.max(10, Math.min(100, remaining));
}

function normalizeResult(
  platform: ContextDevPlatform,
  result: ContextDevSearchResult
): PlatformScrapeResult['posts'][number] | null {
  const rawUrl = stringValue(result.url);
  if (!rawUrl) return null;

  const canonical =
    platform === 'x' ? normalizeXPostUrl(rawUrl) : normalizeLinkedInPostUrl(rawUrl);
  if (!canonical) return null;

  const text =
    stringValue(result.description) ||
    markdownExcerpt(result.markdown?.markdown) ||
    stringValue(result.title);
  if (!text) return null;

  const handle = canonical.handle;

  return {
    postId: makePostId(platform, canonical.url, text),
    platform,
    url: canonical.url,
    authorName: bestDisplayAuthorName({
      platform,
      authorHandle: handle,
    }),
    authorHandle: handle,
    authorUrl: canonical.authorUrl,
    text,
    postedAt: undefined,
    metrics: {},
    tags: ['contextdev'],
    raw: result,
  };
}

function markdownExcerpt(markdown: string | null | undefined, maxLength = 500): string {
  if (typeof markdown !== 'string') return '';
  const compact = markdown.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

interface CanonicalPostUrl {
  url: string;
  handle?: string;
  authorUrl?: string;
}

function normalizeXPostUrl(value: string): CanonicalPostUrl | undefined {
  try {
    const url = new URL(value.trim());
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)) return undefined;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (!match) return undefined;
    const handle = match[1];
    return {
      url: `https://x.com/${handle}/status/${match[2]}`,
      handle,
      authorUrl: `https://x.com/${handle}`,
    };
  } catch {
    return undefined;
  }
}

function normalizeLinkedInPostUrl(value: string): CanonicalPostUrl | undefined {
  try {
    const url = new URL(value.trim());
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return undefined;
    const path = url.pathname.replace(/\/$/, '');
    const isPost =
      /^\/posts\/[^/]+$/i.test(path) ||
      /^\/feed\/update\/urn:li:activity:\d+$/i.test(path) ||
      /^\/pulse\/[^/]+$/i.test(path);
    if (!isPost) return undefined;
    const canonical = `https://www.linkedin.com${path}`;
    const slugMatch = path.match(/^\/posts\/([^/]+)$/i);
    // /posts/<author-slug>_<content-slug>-activity-<id> — author is the slug
    // segment before the first underscore.
    const handle = slugMatch ? slugMatch[1].split('_')[0] : undefined;
    return {
      url: canonical,
      handle,
      authorUrl: handle ? `https://www.linkedin.com/in/${handle}` : undefined,
    };
  } catch {
    return undefined;
  }
}

function postUrlKey(value: string): string {
  const trimmed = value.trim();
  const canonical =
    normalizeXPostUrl(trimmed)?.url ?? normalizeLinkedInPostUrl(trimmed)?.url;
  return (canonical ?? trimmed.split(/[?#]/)[0].replace(/\/$/, '')).toLowerCase();
}

function isoDateOnly(value: string, padDays = 0): string | undefined {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time + padDays * 86400000).toISOString().slice(0, 10);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
