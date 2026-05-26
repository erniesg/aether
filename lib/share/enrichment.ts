import { searchLinkedInViaApify, searchXViaApify } from '@/lib/research/event-recap/apify';
import { isXSearchConfigured, searchXViaOfficialApi } from '@/lib/research/event-recap/x-api';
import type { EventPost, EventPostMetrics, EventPlatform, PlatformScrapeResult } from '@/lib/research/event-recap/types';
import { normalizeMatchedUrl } from './url';
import {
  upsertPublicMention,
  type PublicMentionInput,
  type PublicMentionMetrics,
  type PublicMentionPlatform,
} from './store';

type MentionSearchPlatform = Extract<PublicMentionPlatform, 'x' | 'linkedin'>;

export interface MentionCandidate {
  platform: MentionSearchPlatform;
  url: string;
  text: string;
  authorName?: string;
  authorHandle?: string;
  metrics?: EventPostMetrics;
  raw?: unknown;
}

export interface ResolvedShortShareUrl {
  shortUrl: string;
  canonicalUrl: string;
  code?: string;
}

export interface EnrichPublicMentionsInput {
  canonicalUrls: string[];
  shortUrls?: string[];
  platforms?: MentionSearchPlatform[];
  daysLookback?: number;
  maxItemsPerPlatform?: number;
  fetchImpl?: typeof fetch;
  searchPosts?: (input: {
    queries: string[];
    platforms: MentionSearchPlatform[];
    windowStart: string;
    windowEnd: string;
    maxItemsPerPlatform: number;
  }) => Promise<MentionCandidate[]>;
  upsertMention?: (mention: PublicMentionInput) => Promise<string | null>;
}

export interface EnrichPublicMentionsResult {
  queries: string[];
  searchedPlatforms: MentionSearchPlatform[];
  candidates: number;
  matched: number;
  upserted: number;
  skipped: number;
  warnings: string[];
  mentions: PublicMentionInput[];
}

interface MatchResult {
  matchedUrl: string;
  canonicalUrl: string;
  confidence: PublicMentionInput['confidence'];
  code?: string;
}

const DEFAULT_PLATFORMS: MentionSearchPlatform[] = ['x', 'linkedin'];

export async function enrichPublicMentions(
  input: EnrichPublicMentionsInput
): Promise<EnrichPublicMentionsResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const upsertMention = input.upsertMention ?? upsertPublicMention;
  const platforms = input.platforms?.length ? input.platforms : DEFAULT_PLATFORMS;
  const canonicalUrls = normalizeCanonicalUrlSet(input.canonicalUrls);
  const shortUrls = normalizeUrlSet(input.shortUrls ?? []);
  const warnings: string[] = [];
  const shortMappings = new Map<string, ResolvedShortShareUrl>();

  for (const shortUrl of shortUrls) {
    try {
      const resolved = await resolveShortShareUrl(shortUrl, fetchImpl);
      if (resolved) {
        shortMappings.set(normalizeMatchedUrl(shortUrl), resolved);
        canonicalUrls.add(canonicalMatchKey(resolved.canonicalUrl));
      } else {
        warnings.push(`short URL did not resolve as an aether share link: ${shortUrl}`);
      }
    } catch (err) {
      warnings.push(`short URL resolve failed for ${shortUrl}: ${errorMessage(err)}`);
    }
  }

  const queries = Array.from(new Set([...canonicalUrls, ...shortUrls]));
  if (!queries.length) {
    return {
      queries: [],
      searchedPlatforms: platforms,
      candidates: 0,
      matched: 0,
      upserted: 0,
      skipped: 0,
      warnings: ['no canonical or short URLs provided'],
      mentions: [],
    };
  }

  const { windowStart, windowEnd } = searchWindow(input.daysLookback ?? 14);
  const candidates = input.searchPosts
    ? await input.searchPosts({
        queries,
        platforms,
        windowStart,
        windowEnd,
        maxItemsPerPlatform: input.maxItemsPerPlatform ?? 50,
      })
    : await defaultSearchPosts({
        queries,
        platforms,
        windowStart,
        windowEnd,
        maxItemsPerPlatform: input.maxItemsPerPlatform ?? 50,
      });

  const mentions: PublicMentionInput[] = [];
  let upserted = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const match = await matchCandidate({
      candidate,
      canonicalUrls,
      shortMappings,
      fetchImpl,
      warnings,
    });
    if (!match) {
      skipped += 1;
      continue;
    }
    const mention: PublicMentionInput = {
      canonicalUrl: match.canonicalUrl,
      platform: candidate.platform,
      externalId: externalIdForCandidate(candidate),
      externalUrl: candidate.url,
      authorName: candidate.authorName,
      authorHandle: candidate.authorHandle,
      matchedUrl: match.matchedUrl,
      normalizedCanonicalUrl: normalizeMatchedUrl(match.canonicalUrl),
      matchedCode: match.code,
      metrics: publicMentionMetrics(candidate.metrics),
      confidence: match.confidence,
      raw: candidate.raw,
    };
    mentions.push(mention);
    const id = await upsertMention(mention);
    if (id) upserted += 1;
  }

  return {
    queries,
    searchedPlatforms: platforms,
    candidates: candidates.length,
    matched: mentions.length,
    upserted,
    skipped,
    warnings,
    mentions,
  };
}

export async function resolveShortShareUrl(
  shortUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResolvedShortShareUrl | null> {
  const res = await fetchImpl(shortUrl, {
    headers: {
      'user-agent': 'aether-share-enrichment',
      'x-aether-enrichment': '1',
    },
    redirect: 'manual',
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as
    | { ok?: unknown; canonicalUrl?: unknown; code?: unknown }
    | null;
  if (!json?.ok || typeof json.canonicalUrl !== 'string') return null;
  return {
    shortUrl,
    canonicalUrl: normalizeMatchedUrl(json.canonicalUrl),
    code: typeof json.code === 'string' ? json.code : codeFromShortUrl(shortUrl),
  };
}

async function defaultSearchPosts(input: {
  queries: string[];
  platforms: MentionSearchPlatform[];
  windowStart: string;
  windowEnd: string;
  maxItemsPerPlatform: number;
}): Promise<MentionCandidate[]> {
  const results: PlatformScrapeResult[] = [];
  if (input.platforms.includes('x')) {
    results.push(
      isXSearchConfigured()
        ? await searchXViaOfficialApi({
            querySet: input.queries,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
            maxItems: input.maxItemsPerPlatform,
            maxQueries: input.queries.length,
          })
        : await searchXViaApify({
            querySet: input.queries,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
            maxItems: input.maxItemsPerPlatform,
            maxQueries: input.queries.length,
          })
    );
  }
  if (input.platforms.includes('linkedin')) {
    results.push(
      await searchLinkedInViaApify({
        querySet: input.queries,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        maxItems: input.maxItemsPerPlatform,
        maxQueries: input.queries.length,
        sortBy: 'date',
        contentType: 'all',
        scrapeComments: false,
        scrapeReactions: false,
      })
    );
  }
  return results.flatMap((result) =>
    result.posts.map((post) => eventPostToCandidate(result.platform, post as EventPost))
  );
}

function eventPostToCandidate(platform: EventPlatform, post: EventPost): MentionCandidate {
  return {
    platform: platform === 'linkedin' ? 'linkedin' : 'x',
    url: post.url,
    text: post.text,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    metrics: post.metrics,
    raw: post.raw,
  };
}

async function matchCandidate(input: {
  candidate: MentionCandidate;
  canonicalUrls: Set<string>;
  shortMappings: Map<string, ResolvedShortShareUrl>;
  fetchImpl: typeof fetch;
  warnings: string[];
}): Promise<MatchResult | null> {
  const candidateUrls = extractCandidateUrls(input.candidate);
  for (const url of candidateUrls) {
    const normalized = normalizeMatchedUrl(url);
    const canonicalKey = canonicalMatchKey(url);
    if (input.canonicalUrls.has(canonicalKey)) {
      return {
        matchedUrl: url,
        canonicalUrl: canonicalKey,
        confidence: 'direct_canonical_url',
      };
    }
    const knownShort = input.shortMappings.get(normalized);
    if (knownShort) {
      return {
        matchedUrl: url,
        canonicalUrl: normalizeMatchedUrl(knownShort.canonicalUrl),
        confidence: 'direct_tracked_url',
        code: knownShort.code,
      };
    }
    if (looksLikeAetherShortUrl(normalized)) {
      try {
        const resolved = await resolveShortShareUrl(normalized, input.fetchImpl);
        if (resolved) {
          input.shortMappings.set(normalized, resolved);
          input.canonicalUrls.add(canonicalMatchKey(resolved.canonicalUrl));
          return {
            matchedUrl: url,
            canonicalUrl: normalizeMatchedUrl(resolved.canonicalUrl),
            confidence: 'direct_tracked_url',
            code: resolved.code,
          };
        }
      } catch (err) {
        input.warnings.push(`candidate short URL resolve failed for ${normalized}: ${errorMessage(err)}`);
      }
    }
  }
  return null;
}

function extractCandidateUrls(candidate: MentionCandidate): string[] {
  const found = new Set<string>();
  for (const value of [candidate.url, candidate.text]) collectUrlsFromString(value, found);
  collectUrlsFromUnknown(candidate.raw, found, 0);
  return Array.from(found);
}

function collectUrlsFromUnknown(value: unknown, out: Set<string>, depth: number): void {
  if (depth > 5 || value == null) return;
  if (typeof value === 'string') {
    collectUrlsFromString(value, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) collectUrlsFromUnknown(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/url|link|href/i.test(key) || typeof item !== 'object') collectUrlsFromUnknown(item, out, depth + 1);
    }
  }
}

function collectUrlsFromString(value: string | undefined, out: Set<string>): void {
  if (!value) return;
  const matches = value.match(/https?:\/\/[^\s<>"')\]}]+/gi) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/g, '');
    out.add(cleaned);
  }
}

function normalizeCanonicalUrlSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim()).filter(Boolean).map(canonicalMatchKey));
}

function normalizeUrlSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim()).filter(Boolean).map(normalizeMatchedUrl));
}

function canonicalMatchKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'li_fat_id'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== '/' && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return normalizeMatchedUrl(value);
  }
}

function publicMentionMetrics(metrics?: EventPostMetrics): PublicMentionMetrics {
  return {
    likes: finite(metrics?.likes),
    reposts: finite(metrics?.reposts),
    replies: finite(metrics?.replies),
    comments: finite(metrics?.comments),
    reactions: finite(metrics?.reactions),
    views: finite(metrics?.views),
    impressions: finite(metrics?.impressions),
  };
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function externalIdForCandidate(candidate: MentionCandidate): string | undefined {
  if (candidate.platform === 'x') {
    const match = candidate.url.match(/\/status\/(\d+)/i);
    return match?.[1];
  }
  if (candidate.platform === 'linkedin') {
    const match =
      candidate.url.match(/activity-(\d+)/i) ??
      candidate.url.match(/urn:li:(?:activity|share):(\d+)/i);
    return match?.[1];
  }
  return undefined;
}

function codeFromShortUrl(shortUrl: string): string | undefined {
  try {
    return new URL(shortUrl).pathname.split('/').filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

function looksLikeAetherShortUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /(^|\.)s(?:-stg)?\.berlayar\.ai$/i.test(parsed.hostname) ||
      (parsed.hostname === 'localhost' && /^[a-z0-9]{4,16}$/i.test(parsed.pathname.slice(1)))
    );
  } catch {
    return false;
  }
}

function searchWindow(daysLookback: number): { windowStart: string; windowEnd: string } {
  const now = Date.now();
  const days = Math.max(1, Math.min(30, Math.round(daysLookback)));
  return {
    windowStart: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date(now).toISOString(),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
