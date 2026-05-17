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
  const maxItemsPerPlatform = clampNumber(input.maxItemsPerPlatform, 1, 100, 25);
  const monthlyCreditBudget = clampNumber(input.monthlyCreditBudget, 0, 1000, 50);
  return {
    eventId: input.eventId || createEventId(input.name),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    contextHint: input.contextHint?.trim() || undefined,
    daysBefore,
    daysAfter,
    refreshIntervalHours,
    maxItemsPerPlatform,
    monthlyCreditBudget,
    liveMode: input.liveMode ?? 'mock',
  };
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

export function normalizeQuerySet(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ');
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 12);
}
