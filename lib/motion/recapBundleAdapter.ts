import type {
  BuildEventRecapMotionProjectInput,
  EventRecapQuoteInput,
  EventRecapThemeInput,
} from './recapMotion';

// ---------------------------------------------------------------------------
// Adapter: event-recap public bundle (outputs/event-recap-<event>/public.json)
// → BuildEventRecapMotionProjectInput.
//
// Quote extraction is verbatim-only: candidate posts carrying links are
// skipped entirely rather than having their text rewritten, so every quote
// that reaches the motion project is byte-for-byte corpus text.
// ---------------------------------------------------------------------------

export interface ToEventRecapMotionInputOptions {
  id: string;
  workspaceId: string;
  createdAt: number;
  maxThemes?: number;
  maxQuotes?: number;
  maxTopPostUrlsPerTheme?: number;
  platformTargets?: BuildEventRecapMotionProjectInput['platformTargets'];
  workflowMode?: BuildEventRecapMotionProjectInput['workflowMode'];
  materializeTimeline?: boolean;
}

const MAX_QUOTE_CHARS = 220;

export function toEventRecapMotionInput(
  raw: unknown,
  options: ToEventRecapMotionInputOptions
): BuildEventRecapMotionProjectInput {
  const root = asRecord(raw);
  const eventId = stringValue(root.eventId);
  const eventName = stringValue(root.eventName);
  if (!eventId || !eventName) {
    throw new Error('toEventRecapMotionInput: bundle is missing eventId/eventName');
  }

  const posts = Array.isArray(root.posts) ? root.posts.map(asRecord) : [];
  const postUrlById = new Map<string, string>();
  for (const post of posts) {
    const postId = stringValue(post.postId);
    const url = stringValue(post.url) || stringValue(post.canonicalUrl);
    if (postId && url && !postUrlById.has(postId)) postUrlById.set(postId, url);
  }

  return {
    id: options.id,
    workspaceId: options.workspaceId,
    createdAt: options.createdAt,
    eventId,
    eventName,
    stats: extractStats(root),
    themes: extractThemes(root, postUrlById, options),
    quotes: extractQuotes(posts, options.maxQuotes ?? 2),
    platformTargets: options.platformTargets,
    workflowMode: options.workflowMode,
    materializeTimeline: options.materializeTimeline,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractStats(root: Record<string, unknown>) {
  const stats = asRecord(root.stats);
  const cross = asRecord(stats.crossSurfaceObserved);
  const byPlatform =
    numberRecord(stats.relevantByPlatform) ?? numberRecord(stats.byPlatform) ?? {};
  const postCount =
    finiteNumber(stats.relevantTotal) ??
    finiteNumber(stats.total) ??
    Object.values(byPlatform).reduce((sum, count) => sum + count, 0);

  return {
    postCount,
    viewCount: finiteNumber(cross.knownViews) ?? 0,
    platforms: Object.keys(byPlatform),
  };
}

function extractThemes(
  root: Record<string, unknown>,
  postUrlById: Map<string, string>,
  options: ToEventRecapMotionInputOptions
): EventRecapThemeInput[] {
  const maxThemes = options.maxThemes ?? 3;
  const maxUrls = options.maxTopPostUrlsPerTheme ?? 3;

  const scored: Array<{ theme: EventRecapThemeInput; score: number }> = [];
  for (const entry of Array.isArray(root.themes) ? root.themes : []) {
    const theme = asRecord(entry);
    const label = stringValue(theme.label);
    if (!label) continue;
    const id = stringValue(theme.themeId) || label;
    const postIds = [
      ...(stringArray(theme.rootPostIds) ?? []),
      ...(stringArray(theme.postIds) ?? []),
    ];
    const topPostUrls: string[] = [];
    for (const postId of postIds) {
      if (topPostUrls.length >= maxUrls) break;
      const url = postUrlById.get(postId);
      if (url && !topPostUrls.includes(url)) topPostUrls.push(url);
    }
    scored.push({
      theme: { id, label, summary: stringValue(theme.summary), topPostUrls },
      score: finiteNumber(theme.score) ?? 0,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxThemes).map((entry) => entry.theme);
}

function extractQuotes(
  posts: Record<string, unknown>[],
  maxQuotes: number
): EventRecapQuoteInput[] | undefined {
  const candidates: Array<{ quote: EventRecapQuoteInput; reach: number }> = [];
  for (const post of posts) {
    if (post.rowType !== 'parent') continue;
    const text = stringValue(post.text);
    // Verbatim contract: skip link-bearing posts instead of stripping links.
    if (!text || text.length > MAX_QUOTE_CHARS || /https?:\/\//.test(text)) continue;
    const author = stringValue(post.authorName);
    const sourceUrl = stringValue(post.url) || stringValue(post.canonicalUrl);
    if (!author || !sourceUrl) continue;
    candidates.push({
      quote: { text, author, sourceUrl },
      reach: finiteNumber(post.reachScore) ?? 0,
    });
  }
  candidates.sort((a, b) => b.reach - a.reach);
  const quotes = candidates.slice(0, maxQuotes).map((entry) => entry.quote);
  return quotes.length ? quotes : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);
  const entries = Object.entries(record).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}
