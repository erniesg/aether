import type { CreatorContextModel } from '@/lib/context/model';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

export const RESEARCH_PLATFORMS = [
  'pinterest',
  'instagram',
  'tiktok',
  'xhs',
  'web',
] as const;

export type ResearchPlatform = (typeof RESEARCH_PLATFORMS)[number];
export type ResearchTargetKind = 'url' | 'keyword' | 'hashtag' | 'account';

export interface ResearchTarget {
  id: string;
  kind: ResearchTargetKind;
  platform: ResearchPlatform;
  value: string;
  label: string;
  sourceUrl: string;
  reason: string;
  tags: string[];
}

export interface ResearchPlan {
  seedText: string;
  platforms: ResearchPlatform[];
  targets: ResearchTarget[];
  querySummary: string;
}

export interface ResearchRequest {
  context?: Partial<CreatorContextModel>;
  seedText?: string;
  platforms?: ReadonlyArray<ResearchPlatform>;
  limit?: number;
}

const DEFAULT_LIMIT = 8;
const STOPWORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'into',
  'launch',
  'line',
  'more',
  'shop',
  'that',
  'the',
  'this',
  'with',
]);

const PLATFORM_LABEL: Record<ResearchPlatform, string> = {
  pinterest: 'pinterest',
  instagram: 'instagram',
  tiktok: 'tiktok',
  xhs: 'xhs',
  web: 'web',
};

const PLATFORM_COLORS: Record<ResearchPlatform, [string, string, string]> = {
  pinterest: ['#5f1d2a', '#c83c4a', '#f5d7d8'],
  instagram: ['#3a2a62', '#c35aa5', '#f0d8ef'],
  tiktok: ['#122026', '#29c7c7', '#f3f0e8'],
  xhs: ['#52211e', '#d75644', '#f4d8ce'],
  web: ['#1f2933', '#6481a6', '#dbe7ee'],
};

function isResearchPlatform(value: unknown): value is ResearchPlatform {
  return typeof value === 'string' && RESEARCH_PLATFORMS.includes(value as ResearchPlatform);
}

export function normalizeResearchPlatforms(
  raw?: ReadonlyArray<unknown>
): ResearchPlatform[] {
  const out: ResearchPlatform[] = [];
  for (const value of raw ?? []) {
    if (!isResearchPlatform(value) || out.includes(value)) continue;
    out.push(value);
  }
  return out.length > 0 ? out : ['pinterest', 'instagram', 'tiktok'];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function compactWords(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#@]/g, ' ')
    .replace(/[^a-z0-9\s-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKeyword(value: string): string {
  const words = compactWords(value)
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word.toLowerCase()));
  return words.slice(0, 4).join(' ').toLowerCase();
}

function uniquePush(out: string[], seen: Set<string>, raw: string) {
  const value = normalizeKeyword(raw);
  if (!value) return;
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(value);
}

function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s,]+/gi) ?? [];
  return matches.map((url) => url.replace(/[.)\]]+$/g, ''));
}

function extractHashtags(value: string): string[] {
  return Array.from(value.matchAll(/(^|\s)#([a-z0-9][a-z0-9_-]{1,48})/gi)).map(
    (match) => match[2].toLowerCase()
  );
}

function extractAccounts(value: string): string[] {
  return Array.from(value.matchAll(/(^|\s)@([a-z0-9._-]{2,48})/gi)).map(
    (match) => match[2].toLowerCase()
  );
}

function extractSeedKeywords(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const stripped = value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(^|\s)[#@][a-z0-9._-]+/gi, ' ');
  for (const phrase of stripped.split(/[,;\n|]+/)) {
    uniquePush(out, seen, phrase);
  }
  if (out.length > 0) return out;
  uniquePush(out, seen, stripped);
  return out;
}

function contextKeywords(context?: Partial<CreatorContextModel>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value?: string) => {
    if (value) uniquePush(out, seen, value);
  };

  add(context?.brand?.name);
  add(context?.offer?.name);
  add(context?.offer?.summary);
  for (const claim of context?.offer?.claims ?? []) add(claim);
  add(context?.campaign?.name);
  add(context?.campaign?.goal);
  add(context?.campaign?.audience);
  for (const channel of context?.campaign?.channels ?? []) add(channel);
  for (const signal of context?.signals ?? []) add(signal.title);

  return out;
}

export function defaultResearchSeedText(
  context?: Partial<CreatorContextModel>,
  references: ReadonlyArray<ReferenceRecord> = []
): string {
  const keywords = contextKeywords(context).slice(0, 5);
  for (const ref of references.slice(0, 4)) {
    for (const tag of ref.tags ?? []) keywords.push(tag);
    if (ref.attribution.author) keywords.push(`@${ref.attribution.author}`);
  }
  return Array.from(new Set(keywords.filter(Boolean))).slice(0, 6).join(', ');
}

function platformFromUrl(raw: string): ResearchPlatform {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.includes('pinterest') || host === 'pin.it') return 'pinterest';
    if (host.includes('instagram') || host === 'instagr.am') return 'instagram';
    if (host.includes('tiktok')) return 'tiktok';
    if (
      host.includes('xiaohongshu') ||
      host.includes('xhslink') ||
      host === 'xhs.cn'
    ) {
      return 'xhs';
    }
  } catch {
    // Fall through to web.
  }
  return 'web';
}

function searchUrl(platform: ResearchPlatform, kind: ResearchTargetKind, value: string) {
  const clean = value.replace(/^[@#]+/, '');
  const encoded = encodeURIComponent(clean);
  switch (platform) {
    case 'pinterest':
      return kind === 'account'
        ? `https://www.pinterest.com/${encodeURIComponent(clean)}/`
        : `https://www.pinterest.com/search/pins/?q=${encoded}`;
    case 'instagram':
      return kind === 'account'
        ? `https://www.instagram.com/${encodeURIComponent(clean)}/`
        : `https://www.instagram.com/explore/tags/${encodeURIComponent(slug(clean).replace(/-/g, ''))}/`;
    case 'tiktok':
      return kind === 'account'
        ? `https://www.tiktok.com/@${encodeURIComponent(clean)}`
        : kind === 'hashtag'
          ? `https://www.tiktok.com/tag/${encodeURIComponent(clean)}`
          : `https://www.tiktok.com/search?q=${encoded}`;
    case 'xhs':
      return `https://www.xiaohongshu.com/search_result?keyword=${encoded}`;
    case 'web':
    default:
      return `https://www.google.com/search?udm=2&q=${encoded}`;
  }
}

function makeTarget(input: {
  kind: ResearchTargetKind;
  platform: ResearchPlatform;
  value: string;
  reason: string;
  index: number;
}): ResearchTarget {
  const prefix =
    input.kind === 'hashtag'
      ? '#'
      : input.kind === 'account'
        ? '@'
        : '';
  const label =
    input.kind === 'url'
      ? `${PLATFORM_LABEL[input.platform]} source`
      : `${PLATFORM_LABEL[input.platform]} ${prefix}${input.value}`;
  const sourceUrl =
    input.kind === 'url'
      ? input.value
      : searchUrl(input.platform, input.kind, input.value);
  const id = `research-${input.platform}-${input.kind}-${slug(input.value) || input.index}`;
  return {
    id,
    kind: input.kind,
    platform: input.platform,
    value: input.value,
    label,
    sourceUrl,
    reason: input.reason,
    tags: ['research', input.platform, input.kind, slug(input.value)].filter(Boolean),
  };
}

export function planResearch(
  request: ResearchRequest = {}
): ResearchPlan {
  const seedText =
    request.seedText?.trim() || defaultResearchSeedText(request.context, []);
  const platforms = normalizeResearchPlatforms(request.platforms);
  const limit = Math.max(1, Math.min(24, request.limit ?? DEFAULT_LIMIT));
  const targets: ResearchTarget[] = [];
  const seen = new Set<string>();

  const push = (
    kind: ResearchTargetKind,
    platform: ResearchPlatform,
    value: string,
    reason: string
  ) => {
    if (targets.length >= limit) return;
    const clean =
      kind === 'url'
        ? value.trim()
        : value.replace(/^[@#]+/, '').trim().toLowerCase();
    if (!clean) return;
    const key = `${kind}:${platform}:${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(
      makeTarget({
        kind,
        platform,
        value: clean,
        reason,
        index: targets.length + 1,
      })
    );
  };

  for (const url of extractUrls(seedText)) {
    push('url', platformFromUrl(url), url, 'creator source');
  }

  const explicitHashtags = extractHashtags(seedText);
  const explicitAccounts = extractAccounts(seedText);
  const seedKeywords = extractSeedKeywords(seedText);
  const contextualKeywords = contextKeywords(request.context);

  const candidates: Array<{ kind: ResearchTargetKind; value: string; reason: string }> = [
    ...explicitHashtags.map((value) => ({
      kind: 'hashtag' as const,
      value,
      reason: 'creator hashtag',
    })),
    ...explicitAccounts.map((value) => ({
      kind: 'account' as const,
      value,
      reason: 'creator account',
    })),
    ...seedKeywords.map((value) => ({
      kind: 'keyword' as const,
      value,
      reason: 'creator keyword',
    })),
    ...contextualKeywords.map((value) => ({
      kind: 'keyword' as const,
      value,
      reason: 'creator context',
    })),
  ];

  for (const candidate of candidates) {
    for (const platform of platforms) {
      if (targets.length >= limit) break;
      push(candidate.kind, platform, candidate.value, candidate.reason);
    }
  }

  return {
    seedText,
    platforms,
    targets,
    querySummary:
      targets.length === 0
        ? 'no research targets'
        : targets
            .slice(0, 4)
            .map((target) => target.label)
            .join(' · '),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function researchPreviewDataUrl(target: ResearchTarget, index: number): string {
  const [ink, accent, paper] = PLATFORM_COLORS[target.platform];
  const label = target.kind === 'hashtag' ? `#${target.value}` : target.value;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="840" viewBox="0 0 640 840">`,
    `<rect width="640" height="840" fill="${paper}"/>`,
    `<rect x="52" y="64" width="536" height="612" rx="18" fill="#fffaf2" opacity="0.9"/>`,
    `<circle cx="${170 + (index % 3) * 64}" cy="${190 + (index % 4) * 32}" r="108" fill="${accent}" opacity="0.78"/>`,
    `<rect x="104" y="356" width="432" height="184" rx="8" fill="${ink}" opacity="0.9"/>`,
    `<text x="88" y="728" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(PLATFORM_LABEL[target.platform])}</text>`,
    `<text x="88" y="770" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="34">${escapeXml(label.slice(0, 28))}</text>`,
    `<text x="88" y="806" fill="${ink}" opacity="0.68" font-family="Arial, Helvetica, sans-serif" font-size="20">${escapeXml(target.kind)} research target</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function recordFromResearchTarget(
  target: ResearchTarget,
  index = 0,
  capturedAt = new Date().toISOString()
): ReferenceRecord {
  return {
    id: `ref_research_${target.platform}_${slug(target.kind)}_${slug(target.value) || index}`,
    kind: 'image',
    previewUrl: researchPreviewDataUrl(target, index),
    fullUrl: target.sourceUrl,
    attribution: {
      source: target.platform,
      author: target.kind === 'account' ? target.value : undefined,
      url: target.sourceUrl,
    },
    capturedAt,
    title: target.label,
    usageIntent: 'research direction',
    tags: target.tags,
    notes: `${target.reason}; ${target.kind} ${target.value}`,
  };
}

export function mergeResearchRecords(
  existing: ReadonlyArray<ReferenceRecord>,
  incoming: ReadonlyArray<ReferenceRecord>
): ReferenceRecord[] {
  const seen = new Set(existing.map((record) => record.fullUrl ?? record.previewUrl));
  const merged = [...existing];
  for (const record of incoming) {
    const key = record.fullUrl ?? record.previewUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}
