import type {
  EventPlatform,
  EventPost,
  EventPostMetrics,
  EventRecapConfig,
} from './types';

const NON_ALNUM = /[^a-z0-9]+/g;
const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'because',
  'been',
  'being',
  'but',
  'can',
  'for',
  'from',
  'had',
  'has',
  'have',
  'into',
  'its',
  'just',
  'more',
  'not',
  'our',
  'out',
  'that',
  'the',
  'their',
  'there',
  'this',
  'through',
  'was',
  'were',
  'with',
  'you',
  'your',
]);

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(NON_ALNUM, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'event';
}

export function createEventId(name: string): string {
  return slugify(name);
}

export function clampConfig(input: Partial<EventRecapConfig> & { name: string }): EventRecapConfig {
  const daysBefore = clampNumber(input.daysBefore, 0, 30, 1);
  const daysAfter = clampNumber(input.daysAfter, 0, 30, 3);
  const refreshIntervalHours = clampNumber(input.refreshIntervalHours, 1, 168, 6);
  const maxItemsPerPlatform = clampNumber(input.maxItemsPerPlatform, 1, 1000, 25);
  const monthlyCreditBudget = clampNumber(input.monthlyCreditBudget, 0, 1000, 50);
  return {
    eventId: input.eventId || createEventId(input.name),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    contextHint: input.contextHint?.trim() || undefined,
    startsAt: cleanDateString(input.startsAt),
    endsAt: cleanDateString(input.endsAt),
    daysBefore,
    daysAfter,
    refreshIntervalHours,
    maxItemsPerPlatform,
    monthlyCreditBudget,
    liveMode: input.liveMode ?? 'mock',
  };
}

function cleanDateString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? trimmed : undefined;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function eventWindow(input: {
  startsAt?: string;
  endsAt?: string;
  daysBefore: number;
  daysAfter: number;
}): { windowStart: string; windowEnd: string } {
  const start = input.startsAt ?? new Date().toISOString();
  const end = input.endsAt ?? start;
  return {
    windowStart: addDaysIso(start, -input.daysBefore),
    windowEnd: addDaysIso(end, input.daysAfter),
  };
}

export function textHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function makePostId(platform: EventPlatform, url: string, text: string): string {
  return `${platform}_${textHash(`${url}:${text.slice(0, 240)}`)}`;
}

export function cleanDisplayAuthorName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = stripEventStatusFromAuthorName(decodeHtmlEntities(value).replace(/\s+/g, ' ').trim());
  if (!name) return undefined;
  if (/^(unknown|linkedin)$/i.test(name)) return undefined;
  if (/^\d+(\.\d+)?\s+(comments?|reactions?|likes?|followers?)$/i.test(name)) return undefined;
  if (/^https?:\/\//i.test(name)) return undefined;
  if (/^\{.*\btitle\b/i.test(name) || /["']?\btitle["']?\s*:/i.test(name)) return undefined;
  if (name.includes('#')) return undefined;
  if (name.includes('|')) return undefined;
  if (/\bposted on the topic\b/i.test(name)) return undefined;
  if (/\s+-\s+linkedin$/i.test(name)) return undefined;
  if (/\s+·\s+(luma|events calendar)$/i.test(name)) return undefined;
  if (/^ai engineer singapore\b/i.test(name)) return undefined;
  if (/\b(workshop|hackathon|meetup|conference|event|happy hour)\b.*\bai engineer singapore\b/i.test(name)) {
    return undefined;
  }
  if (/\bcome and join us\b.*\bai engineer\b/i.test(name)) return undefined;
  if (/\bai engineer day singapore\b/i.test(name)) return undefined;
  if (/^(i'?ll|i am|here at|hehe i am)\b.*\b(ai engineer|aie)\b/i.test(name)) return undefined;
  if (name.length > 96) return undefined;
  return name;
}

export function extractAuthorNameFromTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
  if (!title) return undefined;

  const pipeSegments = title
    .split('|')
    .map((segment) => cleanDisplayAuthorName(segment.replace(/\s+posted on the topic\b.*$/i, '')))
    .filter((segment): segment is string => Boolean(segment));
  if (pipeSegments.length) return pipeSegments.at(-1);

  return cleanDisplayAuthorName(title.replace(/\s+-\s+LinkedIn$/i, ''));
}

export function displayNameFromHandle(
  handle: string | undefined,
  platform?: EventPlatform
): string | undefined {
  const cleanHandle = handle?.replace(/^@/, '').trim();
  if (!cleanHandle) return undefined;
  if (platform === 'x') return `@${cleanHandle}`;

  const parts = cleanHandle
    .split(/[-_.]+/)
    .filter(Boolean)
    .filter((part, index, all) => {
      const isLast = index === all.length - 1;
      return !(isLast && (/\d/.test(part) || /^[a-f0-9]{6,}$/i.test(part)));
    });
  if (parts.length < 2) return cleanHandle;
  return parts.map(titleCaseHandlePart).join(' ');
}

export function bestDisplayAuthorName(input: {
  platform?: EventPlatform;
  authorName?: string;
  authorHandle?: string;
  raw?: unknown;
}): string {
  const raw = input.raw && typeof input.raw === 'object' ? (input.raw as Record<string, unknown>) : {};
  const candidates = [
    input.authorName,
    extractAuthorNameFromTitle(input.authorName),
    raw.author,
    raw.authorName,
    raw.author_name,
    extractAuthorNameFromTitle(raw.title),
    extractAuthorNameFromTitle(raw.ogTitle),
  ];
  const cleanCandidates = candidates
    .map((candidate) => cleanDisplayAuthorName(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
  const clean =
    cleanCandidates.find((candidate) => !matchesHandle(candidate, input.authorHandle)) ??
    cleanCandidates[0];
  return (
    clean ??
    displayNameFromHandle(input.authorHandle, input.platform) ??
    cleanDisplayAuthorName(input.authorName) ??
    input.authorName ??
    'unknown'
  );
}

function decodeHtmlEntities(value: string): string {
  let out = value;
  for (let pass = 0; pass < 2; pass += 1) {
    out = out
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  return out;
}

function titleCaseHandlePart(value: string): string {
  const lower = value.toLowerCase();
  if (/^(ai|api|asean|cto|gcp|io|llm|llms|ml|sg|usa|vc)$/i.test(value)) return lower.toUpperCase();
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

function stripEventStatusFromAuthorName(value: string): string {
  const stripped = value
    .replace(/\s+(?:is\s+)?at\s+(?:the\s+)?ai\s+engineer\s+singapore.*$/i, '')
    .replace(/\s+(?:(?:is|was)\s+)?at\s+(?:the\s+)?(?:ai\s+eng\s+sg|ai\s+engineer\s+sg|ai\s+engineer\s+summit|aie\s+sg).*$/i, '')
    .replace(/\s+@\s+ai\s+engineer\s+singapore.*$/i, '')
    .replace(/\s+@\s*(?:ai\s*(?:eng|engineer)\s*(?:singapore|sg)|aie\s*sg|aie)\b.*$/i, '')
    .replace(/\s*[-–—]\s*.*\b(?:ai\s+builder\s+@\s+aie|aie\s+sg|ai\s+eng(?:ineer)?\s+singapore)\b.*$/i, '')
    .replace(/\s*[-–—]\s*ai\s+builder\s*$/i, '')
    .replace(/\s*\([^)]*\b(?:aie\s+sg|ai\s+engineer)\b[^)]*\)\s*$/i, '')
    .replace(/\s+at\s+aie\s+singapore.*$/i, '')
    .trim();
  return /^[a-z]+(?:\s+[a-z]+)*$/.test(stripped) ? titleCaseWords(stripped) : stripped;
}

function matchesHandle(name: string, handle: string | undefined): boolean {
  if (!handle) return false;
  if (/\s/.test(name.trim())) return false;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalize(name) === normalize(handle.replace(/^@/, ''));
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function engagement(metrics: EventPostMetrics): number {
  return (
    (metrics.likes ?? 0) +
    (metrics.reactions ?? 0) +
    (metrics.reposts ?? 0) * 2 +
    (metrics.replies ?? 0) * 2 +
    (metrics.comments ?? 0) * 2 +
    (metrics.views ?? metrics.impressions ?? 0) / 200
  );
}

export function scorePostsByPlatform(posts: EventPost[]): EventPost[] {
  const groups = new Map<EventPlatform, EventPost[]>();
  for (const post of posts) {
    const group = groups.get(post.platform) ?? [];
    group.push(post);
    groups.set(post.platform, group);
  }
  const out: EventPost[] = [];
  for (const group of groups.values()) {
    const scores = group.map((p) => engagement(p.metrics));
    const mean = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length);
    const variance =
      scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / Math.max(1, scores.length);
    const stdev = Math.sqrt(variance) || 1;
    for (const post of group) {
      out.push({
        ...post,
        reachScore: Number(((engagement(post.metrics) - mean) / stdev).toFixed(3)),
      });
    }
  }
  return out.sort((a, b) => b.reachScore - a.reachScore);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]/g, ' ')
    .replace(NON_ALNUM, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

export function shortExcerpt(text: string, limit = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trim()}...`;
}

export function normalizeQuerySet(values: ReadonlyArray<string>, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ');
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, limit);
}
