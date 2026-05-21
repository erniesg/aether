import {
  emptyEventPlatformCounts,
  type EventExpansionAnchor,
  type EventExpansionAnchorKind,
  type EventExpansionPlan,
  type EventFrontierSourceKind,
  type EventPlatform,
  type EventPost,
} from './types';
import { classifyConversationPost } from './conversation';
import { engagement, normalizeQuerySet, tokenize } from './utils';

const HIRING_NOISE = new Set([
  '#career',
  '#careers',
  '#hiring',
  '#job',
  '#jobs',
  '#jobsearch',
  '#aijobs',
  '#recruiting',
  '#softwareengineering',
  '#techhiring',
]);

const GENERIC_HASHTAGS = new Set(['#ai', '#singapore', '#sg', '#tech']);

const GENERIC_ENTITIES = new Set([
  'AI',
  'Friday',
  'Engineer',
  'Engineering',
  'Monday',
  'Saturday',
  'Singapore',
  'Sunday',
  'Thursday',
  'Tuesday',
  'Wednesday',
  'LinkedIn',
  'Just',
  'Twitter',
  'Today',
  'Thanks',
  'There',
  'People',
  'Event',
  'Excited',
  'Summit',
  'What',
  'When',
  'Where',
  'Who',
  'Why',
]);

const SINGLE_TOKEN_ENTITY_ALLOWLIST = new Set([
  'AIE',
  'Arize',
  'Cerebras',
  'Claude',
  'Codex',
  'Convex',
  'Cursor',
  'Daytona',
  'Exa',
  'Gemini',
  'HuggingFace',
  'MiniMax',
  'Minister',
  'NanoClaw',
  'OpenAI',
  'Pullman',
  'SMU',
  'Tusk',
  'Vercel',
]);

const STRONG_TERMS = new Set([
  'agent',
  'agentic',
  'agents',
  'ai',
  'aidotengineer',
  'aisg',
  'claude',
  'convex',
  'cursor',
  'engineer',
  'engineering',
  'evals',
  'govtech',
  'llm',
  'llms',
  'mcp',
  'openai',
  'rag',
  'singapore',
  'summit',
]);

const CORPUS_PHRASE_RULES: Array<{ value: string; pattern: RegExp }> = [
  { value: 'Road to AIE', pattern: /\broad to (?:aie|ai engineer(?: singapore)?)\b/i },
  { value: 'AI Engineer SG', pattern: /\bai engineer sg\b/i },
  { value: 'AIE SG', pattern: /\baie\s+sg\b/i },
  { value: 'AIE2026', pattern: /\b#?aie2026\b/i },
  { value: 'AI Engineer Summit Singapore', pattern: /\bai engineer summit singapore\b/i },
  { value: 'AI Engineer side event', pattern: /\b(?:ai engineer\s+)?side events?\b/i },
  { value: 'AI Engineer workshop', pattern: /\b(?:ai engineer\s+)?workshops?\b/i },
  { value: 'AI Engineer hackathon', pattern: /\b(?:ai engineer\s+)?hackathon\b/i },
  { value: 'Codex Booth', pattern: /\bcodex booth\b/i },
  { value: 'feel-the-AGI', pattern: /\bfeel[-\s]the[-\s]agi\b/i },
  { value: 'Second Brain', pattern: /\bsecond brain\b/i },
  { value: 'personal AI stack', pattern: /\bpersonal ai stack\b/i },
  { value: 'Cabinet Minister', pattern: /\bcabinet minister\b/i },
  { value: 'Foreign Affairs', pattern: /\bforeign affairs\b/i },
  { value: 'NanoClaw', pattern: /\bnanoclaw\b/i },
  { value: 'long-running agents', pattern: /\blong[-\s]running agents\b/i },
  { value: 'agentic AI', pattern: /\bagentic ai\b/i },
  { value: 'vibe coding', pattern: /\bvibe[-\s]coding\b/i },
  { value: 'AI Builders Meetup', pattern: /\bai builders meetup\b/i },
  { value: 'student ticket', pattern: /\b(?:student|sponsored) tickets?\b/i },
  { value: 'fully sponsored ticket', pattern: /\bfully sponsored ticket\b/i },
  { value: 'Capitol Kempinski', pattern: /\bcapitol kempinski\b/i },
  { value: 'Pullman', pattern: /\bpullman\b/i },
  { value: 'SMU', pattern: /\bsmu\b/i },
];

interface DeriveExpansionOptions {
  baseQueries?: string[];
  maxAnchors?: number;
  maxQueries?: number;
}

interface Candidate {
  kind: EventExpansionAnchorKind;
  value: string;
  count: number;
  platforms: Set<EventPlatform>;
  samplePostIds: string[];
  reach: number;
  relevantPosts: number;
  noisyPosts: number;
}

export function deriveExpansionPlan(
  eventName: string,
  posts: EventPost[],
  options: DeriveExpansionOptions = {}
): EventExpansionPlan {
  const maxAnchors = options.maxAnchors ?? 20;
  const maxQueries = options.maxQueries ?? 12;
  const eventTokens = new Set([...tokenize(eventName), ...STRONG_TERMS]);
  const candidates = new Map<string, Candidate>();
  const platformCounts: Record<EventPlatform, number> = emptyEventPlatformCounts();

  for (const post of posts) {
    platformCounts[post.platform] += 1;
    const relevance = relevanceScore(post, eventTokens);
    const classification = classifyConversationPost(post);
    const noisy = isHiringNoise(post) || classification.intent === 'announcement';
    for (const anchor of extractAnchors(post, eventName)) {
      if (
        anchor.kind === 'hashtag' &&
        (HIRING_NOISE.has(anchor.value.toLowerCase()) ||
          GENERIC_HASHTAGS.has(anchor.value.toLowerCase()))
      ) {
        continue;
      }
      addCandidate(candidates, anchor.kind, anchor.value, post, relevance, noisy);
    }
  }

  for (const official of officialEventAnchors(eventName)) {
    addSyntheticCandidate(candidates, official.kind, official.value, official.boost);
  }

  const anchors = Array.from(candidates.values())
    .map((candidate) => toAnchor(candidate, eventName))
    .filter((anchor) => anchor.score > 0)
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, maxAnchors);

  const querySet = buildExpandedQuerySet(options.baseQueries ?? [], anchors, maxQueries);

  const warnings: string[] = [];
  if (posts.length < 100) {
    warnings.push('Expansion plan is based on a small seed corpus; treat long-tail recall as incomplete.');
  }
  const missingPlatforms = Object.entries(platformCounts)
    .filter(([, count]) => count === 0)
    .map(([platform]) => platform);
  if (missingPlatforms.length > 0 && missingPlatforms.length < Object.keys(platformCounts).length) {
    warnings.push(
      `No ${missingPlatforms.join(' or ')} posts were present, so expansion is skewed toward ${Object.entries(
        platformCounts
      )
        .filter(([, count]) => count > 0)
        .map(([platform]) => platform)
        .join(' + ')}.`
    );
  }
  const noisyCount = posts.filter(isHiringNoise).length;
  if (noisyCount > 0) {
    warnings.push(`Filtered ${noisyCount} hiring/candidate-noise posts out of hashtag expansion scoring.`);
  }

  return {
    eventName,
    generatedAt: Date.now(),
    corpus: {
      posts: posts.length,
      platforms: platformCounts,
    },
    anchors,
    querySet,
    warnings,
  };
}

function extractAnchors(
  post: EventPost,
  eventName: string
): Array<{ kind: EventExpansionAnchorKind; value: string }> {
  const anchors: Array<{ kind: EventExpansionAnchorKind; value: string }> = [];
  for (const hashtag of post.text.match(/#[A-Za-z][A-Za-z0-9_]{2,40}/g) ?? []) {
    anchors.push({ kind: 'hashtag', value: normalizeHashtag(hashtag) });
  }
  for (const mention of post.text.match(/@[A-Za-z0-9_]{2,30}/g) ?? []) {
    anchors.push({ kind: 'mention', value: normalizeMention(mention) });
  }
  const handle = normalizeHandle(post.authorHandle);
  if (handle) {
    anchors.push({
      kind: post.platform === 'x' ? 'mention' : 'author',
      value: post.platform === 'x' ? `@${handle}` : handle,
    });
  }
  const authorName = cleanAuthorName(post.authorName);
  if (authorName && usefulAuthorName(authorName)) {
    anchors.push({ kind: 'author', value: authorName });
  }
  for (const entity of extractEntities(post.text, eventName)) {
    anchors.push({ kind: 'entity', value: entity });
  }
  for (const phrase of extractCorpusPhrases(post.text)) {
    anchors.push({ kind: 'query', value: phrase });
  }
  return dedupeAnchors(anchors);
}

function extractCorpusPhrases(text: string): string[] {
  const out: string[] = [];
  for (const rule of CORPUS_PHRASE_RULES) {
    if (rule.pattern.test(text)) out.push(rule.value);
  }
  return out;
}

function extractEntities(text: string, eventName: string): string[] {
  const eventLower = eventName.toLowerCase();
  const eventTokens = new Set(tokenize(eventName));
  const matches = text.match(/\b[A-Z][A-Za-z0-9.+&-]{2,}(?:\s+[A-Z][A-Za-z0-9.+&-]{2,}){0,3}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (value.length < 4 || value.length > 60) continue;
    if (GENERIC_ENTITIES.has(value)) continue;
    if (/^(The|This|That|And|But|For)\b/.test(value)) continue;
    const key = value.toLowerCase();
    if (eventLower.includes(key) || seen.has(key)) continue;
    const entityTokens = tokenize(value);
    if (entityTokens.length > 0 && entityTokens.every((token) => eventTokens.has(token))) {
      continue;
    }
    if (
      entityTokens.length === 1 &&
      value !== value.toUpperCase() &&
      !SINGLE_TOKEN_ENTITY_ALLOWLIST.has(value)
    ) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 8);
}

function addCandidate(
  candidates: Map<string, Candidate>,
  kind: EventExpansionAnchorKind,
  value: string,
  post: EventPost,
  relevance: number,
  noisy: boolean
) {
  const key = `${kind}:${value.toLowerCase()}`;
  const current =
    candidates.get(key) ??
    ({
      kind,
      value,
      count: 0,
      platforms: new Set<EventPlatform>(),
      samplePostIds: [],
      reach: 0,
      relevantPosts: 0,
      noisyPosts: 0,
    } satisfies Candidate);
  current.count += 1;
  current.platforms.add(post.platform);
  current.reach += Math.max(0, post.reachScore) + Math.log1p(engagement(post.metrics));
  if (relevance > 0) current.relevantPosts += 1;
  if (noisy) current.noisyPosts += 1;
  if (current.samplePostIds.length < 5) current.samplePostIds.push(post.postId);
  candidates.set(key, current);
}

function addSyntheticCandidate(
  candidates: Map<string, Candidate>,
  kind: EventExpansionAnchorKind,
  value: string,
  boost: number
) {
  const key = `${kind}:${value.toLowerCase()}`;
  const current =
    candidates.get(key) ??
    ({
      kind,
      value,
      count: 0,
      platforms: new Set<EventPlatform>(),
      samplePostIds: [],
      reach: 0,
      relevantPosts: 0,
      noisyPosts: 0,
    } satisfies Candidate);
  current.reach += boost;
  current.relevantPosts += 1;
  candidates.set(key, current);
}

function toAnchor(candidate: Candidate, eventName: string): EventExpansionAnchor {
  const platforms = Array.from(candidate.platforms).sort() as EventPlatform[];
  const platformBonus = platforms.length > 1 ? 6 : 0;
  const officialBonus = /aidotengineer|ai\.engineer/i.test(candidate.value) ? 40 : 0;
  const kindBonus =
    candidate.kind === 'mention' ? 8 : candidate.kind === 'author' ? 4 : candidate.kind === 'entity' ? 2 : 0;
  const noisePenalty = candidate.noisyPosts * 5;
  const score = Number(
    (
      candidate.count * 3 +
      candidate.relevantPosts * 4 +
      Math.log1p(candidate.reach) * 5 +
      platformBonus +
      officialBonus +
      kindBonus -
      noisePenalty
    ).toFixed(3)
  );
  return {
    kind: candidate.kind,
    sourceKind: sourceKindForAnchor(candidate),
    value: candidate.value,
    query: queryForAnchor(candidate, eventName),
    score,
    count: candidate.count,
    platforms,
    samplePostIds: candidate.samplePostIds,
    bias: biasForAnchor(candidate, platforms),
    reason: reasonForAnchor(candidate, platforms),
  };
}

function queryForAnchor(candidate: Candidate, eventName: string): string {
  const isAiEngineer = /\bai\s*engineer\b/i.test(eventName);
  if (/^@?aiDotEngineer$/i.test(candidate.value) || /ai\.engineer/i.test(candidate.value)) {
    return '@aiDotEngineer Singapore';
  }
  if (candidate.kind === 'query') return queryForPhrase(candidate.value, eventName);
  if (candidate.kind === 'hashtag') return isAiEngineer ? `${candidate.value} Singapore` : `${candidate.value} "${eventName}"`;
  if (candidate.kind === 'mention') return isAiEngineer ? `${candidate.value} Singapore` : `${candidate.value} "${eventName}"`;
  if (candidate.kind === 'author') return `${candidate.value} "${eventName}"`;
  return isAiEngineer ? `${candidate.value} "AI Engineer" Singapore` : `${candidate.value} "${eventName}"`;
}

function queryForPhrase(value: string, eventName: string): string {
  if (/\b(?:AIE|AI Engineer)\b/i.test(value)) return `"${value}" Singapore`;
  return `"${value}" "${eventName}"`;
}

function buildExpandedQuerySet(
  baseQueries: string[],
  anchors: EventExpansionAnchor[],
  maxQueries: number
): string[] {
  const head = anchors.slice(0, Math.min(8, maxQueries));
  const topHashtags = anchors.filter((anchor) => anchor.kind === 'hashtag').slice(0, 4);
  const crossPlatform = anchors.filter((anchor) => anchor.platforms.length > 1).slice(0, 4);
  return normalizeQuerySet(
    [
      ...baseQueries,
      ...head.map((anchor) => anchor.query),
      ...topHashtags.map((anchor) => anchor.query),
      ...crossPlatform.map((anchor) => anchor.query),
      ...anchors.map((anchor) => anchor.query),
    ],
    maxQueries
  );
}

function reasonForAnchor(candidate: Candidate, platforms: EventPlatform[]): string {
  const surface = platforms.length ? `seen on ${platforms.join(' + ')}` : 'seeded from event name';
  const noisy =
    candidate.noisyPosts > 0 ? `, with ${candidate.noisyPosts} noisy posts down-weighted` : '';
  return `${candidate.count} corpus hits, ${candidate.relevantPosts} relevant hits, ${surface}${noisy}`;
}

function sourceKindForAnchor(candidate: Candidate): EventFrontierSourceKind {
  if (/aidotengineer|ai\.engineer/i.test(candidate.value)) return 'official-schedule';
  if (candidate.kind === 'hashtag') return 'broad-public-search';
  if (candidate.kind === 'query') return 'corpus-discovered';
  if (candidate.kind === 'mention' || candidate.kind === 'author') return 'corpus-discovered';
  if (/convex|openai|vercel|google|govtech|aisg|singtel/i.test(candidate.value)) {
    return 'sponsor-org';
  }
  return 'corpus-discovered';
}

function biasForAnchor(candidate: Candidate, platforms: EventPlatform[]): string {
  if (candidate.noisyPosts > candidate.relevantPosts) {
    return 'likely announcement or hiring-heavy; use for discovery, not sentiment summary';
  }
  if (/aidotengineer|ai\.engineer/i.test(candidate.value)) {
    return 'organizer-biased; high recall for event references but promo-heavy';
  }
  if (candidate.kind === 'hashtag') {
    return 'public-search-biased; broad hashtags over-sample popular and promotional posts';
  }
  if (candidate.kind === 'query') {
    return 'corpus-phrase-derived; high precision for follow-on discovery but can over-focus on already-visible subtopics';
  }
  if (platforms.length === 1) {
    return `platform-skewed toward ${platforms[0]}; validate against other platforms before summarizing`;
  }
  return 'corpus-discovered from mixed-platform posts';
}

function officialEventAnchors(eventName: string): Array<{
  kind: EventExpansionAnchorKind;
  value: string;
  boost: number;
}> {
  if (!/\bai\s*engineer\b/i.test(eventName)) return [];
  return [
    { kind: 'mention', value: '@aiDotEngineer', boost: 60 },
    { kind: 'entity', value: 'AI Engineer', boost: 20 },
  ];
}

function relevanceScore(post: EventPost, eventTokens: Set<string>): number {
  const tokens = tokenize(`${post.text} ${post.tags.join(' ')}`);
  let score = 0;
  for (const token of tokens) {
    if (eventTokens.has(token)) score += 1;
  }
  if (/\bSingapore\b/i.test(post.text) && /\bAI\b/i.test(post.text)) score += 2;
  if (/aiDotEngineer|AI Engineer Summit|AI\.Engineer/i.test(post.text)) score += 4;
  if (isHiringNoise(post)) score -= 3;
  if (classifyConversationPost(post).intent === 'announcement') score -= 2;
  return score;
}

function isHiringNoise(post: EventPost): boolean {
  const text = `${post.text} ${post.tags.join(' ')}`.toLowerCase();
  return (
    /\b(hiring|recruiting|job ad|job opening|apply now|candidate|resume|cv|salary|vacancy)\b/.test(
      text
    ) || post.tags.some((tag) => /hiring|candidate|job/i.test(tag))
  );
}

function normalizeHashtag(value: string): string {
  return `#${value.replace(/^#+/, '').trim()}`;
}

function normalizeMention(value: string): string {
  return `@${value.replace(/^@+/, '').trim()}`;
}

function normalizeHandle(value?: string): string | undefined {
  const handle = value?.replace(/^@+/, '').trim();
  if (!handle || /\s/.test(handle) || handle.length > 60) return undefined;
  return handle;
}

function usefulAuthorName(value: string): boolean {
  const trimmed = cleanAuthorName(value);
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/unknown|linkedin member/i.test(trimmed)) return false;
  return true;
}

function cleanAuthorName(value: string): string {
  return value
    .replace(/\s+is at\s+.*$/i, '')
    .replace(/\s+at\s+ai\s*engineer.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeAnchors(
  anchors: Array<{ kind: EventExpansionAnchorKind; value: string }>
): Array<{ kind: EventExpansionAnchorKind; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ kind: EventExpansionAnchorKind; value: string }> = [];
  for (const anchor of anchors) {
    const key = `${anchor.kind}:${anchor.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(anchor);
  }
  return out;
}
