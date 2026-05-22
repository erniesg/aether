import { deriveSeedFrontier } from '@/lib/research/event-recap/frontier';
import {
  EVENT_PLATFORMS,
  isEventPlatform,
  type EventExpansionPlan,
  type EventPlatform,
} from '@/lib/research/event-recap/types';
import { createEventId, normalizeQuerySet } from '@/lib/research/event-recap/utils';

export type VibesSubjectKind = 'event' | 'brand' | 'product' | 'topic';
export type VibesTermKind = 'keyword' | 'hashtag' | 'account' | 'source';
export type VibesStepStatus = 'planned' | 'needs-review' | 'ready';

export interface VibesManualTerms {
  keywords?: string[];
  hashtags?: string[];
  accounts?: string[];
  sourceLinks?: string[];
  platforms?: EventPlatform[];
}

export interface VibesAuditStep {
  id: string;
  label: string;
  status: VibesStepStatus;
  provider: string;
  telemetry: string[];
}

export interface VibesRuntimeAdapter {
  provider: 'anthropic' | 'openai' | 'aether';
  /**
   * `active` — runs in this plan. `available` — a wired adapter that is NOT
   * invoked here. Vibes plans run the deterministic frontier planner, not a
   * hosted Claude/OpenAI agent, so only the `aether` runtime is `active`.
   */
  status: 'active' | 'available';
  label: string;
  fit: string;
  auditHook: string;
}

export interface VibesPlan {
  brief: string;
  subject: string;
  subjectKind: VibesSubjectKind;
  eventId: string;
  contextHint: string;
  platforms: EventPlatform[];
  keywords: string[];
  hashtags: string[];
  accounts: string[];
  sourceLinks: string[];
  querySet: string[];
  frontier: EventExpansionPlan;
  auditSteps: VibesAuditStep[];
  managedRuntimes: VibesRuntimeAdapter[];
  apiShape: {
    create: string;
    report: string;
    refresh: string;
  };
}

export interface BuildVibesPlanInput extends VibesManualTerms {
  brief: string;
  subject?: string;
  subjectKind?: VibesSubjectKind;
  maxQueries?: number;
}

const URL_RE = /https?:\/\/[^\s),]+/gi;
const HASHTAG_RE = /#[A-Za-z][A-Za-z0-9_]{1,60}/g;
const ACCOUNT_RE = /@[A-Za-z0-9_.-]{2,60}/g;
const QUOTED_RE = /["']([^"']{3,96})["']/g;

const STOPWORDS = new Set([
  'a',
  'add',
  'about',
  'after',
  'all',
  'allow',
  'also',
  'an',
  'and',
  'any',
  'around',
  'across',
  'as',
  'at',
  'basically',
  'be',
  'brand',
  'brands',
  'build',
  'can',
  'could',
  'do',
  'does',
  'etc',
  'event',
  'for',
  'from',
  'generate',
  'hashtags',
  'include',
  'including',
  'input',
  'iterate',
  'keywords',
  'like',
  'listen',
  'listening',
  'linkedin',
  'managed',
  'natural',
  'of',
  'on',
  'or',
  'page',
  'product',
  'products',
  'report',
  'research',
  'social',
  'specify',
  'step',
  'take',
  'that',
  'the',
  'then',
  'to',
  'track',
  'up',
  'users',
  'vibes',
  'we',
  'with',
  'would',
  'x',
  'youtube',
]);

export function buildVibesPlan(input: BuildVibesPlanInput): VibesPlan {
  const brief = input.brief.trim();
  const extracted = extractBriefTerms(brief);
  const subject = sanitizeSubject(input.subject) ?? inferSubject(brief, extracted) ?? 'vibe research';
  const subjectKind = input.subjectKind ?? inferSubjectKind(subject, brief);
  const sourceLinks = normalizeUrls([...(input.sourceLinks ?? []), ...extracted.sourceLinks]);
  const accounts = normalizeAccounts([...(input.accounts ?? []), ...extracted.accounts]);
  const hashtags = normalizeHashtags([...(input.hashtags ?? []), ...extracted.hashtags]);
  const keywords = normalizeQuerySet(
    [
      subject,
      ...extracted.keywords,
      ...(input.keywords ?? []),
      ...hashtags.map((tag) => tag.replace(/^#/, '')),
      ...accounts.map((account) => account.replace(/^@/, '')),
    ],
    18
  );
  const platforms = normalizePlatforms(input.platforms);
  const contextHint = buildContextHint({
    brief,
    subjectKind,
    keywords,
    hashtags,
    accounts,
    sourceLinks,
  });
  const frontier = deriveSeedFrontier({
    eventName: subject,
    contextHint,
    sourceUrls: sourceLinks,
    maxQueries: Math.max(12, Math.min(input.maxQueries ?? 24, 32)),
  });
  const querySet = normalizeQuerySet(
    [
      ...frontier.querySet,
      ...keywords.map((keyword) => queryForKeyword(keyword, subject)),
      ...hashtags.map((hashtag) => `${hashtag} "${subject}"`),
      ...accounts.map((account) => `${account} "${subject}"`),
    ],
    Math.max(12, Math.min(input.maxQueries ?? 32, 48))
  );
  const eventId = createEventId(subject);

  return {
    brief,
    subject,
    subjectKind,
    eventId,
    contextHint,
    platforms,
    keywords,
    hashtags,
    accounts,
    sourceLinks,
    querySet,
    frontier: {
      ...frontier,
      querySet,
    },
    auditSteps: auditSteps(),
    managedRuntimes: managedRuntimes(),
    apiShape: {
      create: 'POST /api/vibes',
      report: `/events/${eventId}`,
      refresh: `POST /api/events/${eventId}/refresh`,
    },
  };
}

export function extractBriefTerms(brief: string): Required<VibesManualTerms> {
  const withoutUrls = brief.replace(URL_RE, ' ');
  const sourceLinks = [...brief.matchAll(URL_RE)].map((match) => trimUrl(match[0]));
  const hashtags = [...withoutUrls.matchAll(HASHTAG_RE)].map((match) => match[0]);
  const accounts = [...withoutUrls.matchAll(ACCOUNT_RE)].map((match) => match[0]);
  const quoted = [...brief.matchAll(QUOTED_RE)].map((match) => match[1]);
  const keywords = normalizeQuerySet(
    [
      ...quoted,
      ...candidatePhrases(
        withoutUrls
          .replace(HASHTAG_RE, ' ')
          .replace(ACCOUNT_RE, ' ')
      ),
    ],
    16
  );

  return {
    keywords,
    hashtags: normalizeHashtags(hashtags),
    accounts: normalizeAccounts(accounts),
    sourceLinks: normalizeUrls(sourceLinks),
    platforms: [...EVENT_PLATFORMS],
  };
}

function inferSubject(
  brief: string,
  extracted: Required<VibesManualTerms>
): string | undefined {
  const clean = brief
    .replace(URL_RE, ' ')
    .replace(HASHTAG_RE, ' ')
    .replace(ACCOUNT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const explicit = clean.match(
    /\b(?:for|about|around|on|track|recap|listen(?:ing)? for|social listening for)\s+(.{4,120})/i
  )?.[1];
  const candidate = explicit ?? clean;
  const bounded = candidate
    .split(/[.;\n]/)[0]
    .replace(/\b(?:across|and|include|including|then|via|with|that|where|into|using)\b.*$/i, '')
    .replace(/\b(?:social listening|report|vibes|page|managed agents?)\b.*$/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .trim();
  if (isSpecificSubject(bounded)) return bounded;
  const titlePhrase = bestTitlePhrase(bounded);
  if (titlePhrase) return titlePhrase;
  return extracted.keywords.find((keyword) => keyword.length >= 4);
}

function isSpecificSubject(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  if (!/[A-Z0-9]/.test(value)) return false;
  return !words.every((word) => STOPWORDS.has(word.toLowerCase()));
}

function bestTitlePhrase(value: string): string | undefined {
  const matches = value.match(
    /\b[A-Z0-9][A-Za-z0-9&.+-]*(?:\s+[A-Z0-9][A-Za-z0-9&.+-]*){0,7}\b/g
  );
  const sorted = (matches ?? [])
    .map((match) => match.trim())
    .filter((match) => match.length >= 4)
    .filter((match) => !/^(Would|Could|Please|Need|Make|Build|Create)$/i.test(match))
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
  return sorted[0];
}

function inferSubjectKind(subject: string, brief: string): VibesSubjectKind {
  const text = `${subject} ${brief}`.toLowerCase();
  if (/\b(conference|summit|festival|expo|hackathon|meetup|webinar|event|launch|roadshow|showcase)\b/.test(text)) {
    return 'event';
  }
  if (/\b(product|app|device|drop|release|sku|collection|feature)\b/.test(text)) {
    return 'product';
  }
  if (/\b(brand|company|competitor|competitors|campaign)\b/.test(text)) {
    return 'brand';
  }
  return 'topic';
}

function candidatePhrases(value: string): string[] {
  const chunks = value
    .split(/[.;,\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const phrases: string[] = [];
  for (const chunk of chunks) {
    const words = chunk
      .split(/\s+/)
      .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
      .filter((word) => word.length >= 3)
      .filter((word) => !STOPWORDS.has(word.toLowerCase()));
    if (words.length >= 2) phrases.push(words.slice(0, 8).join(' '));
    if (words.length === 1 && words[0].length >= 4) phrases.push(words[0]);
  }
  return phrases;
}

function sanitizeSubject(value: string | undefined): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.slice(0, 96);
}

function buildContextHint(input: {
  brief: string;
  subjectKind: VibesSubjectKind;
  keywords: string[];
  hashtags: string[];
  accounts: string[];
  sourceLinks: string[];
}): string {
  return [
    `${input.subjectKind} social listening brief: ${input.brief}`,
    input.keywords.length ? `keywords: ${input.keywords.join(', ')}` : '',
    input.hashtags.length ? `hashtags: ${input.hashtags.join(', ')}` : '',
    input.accounts.length ? `accounts: ${input.accounts.join(', ')}` : '',
    input.sourceLinks.length ? `source links: ${input.sourceLinks.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function queryForKeyword(keyword: string, subject: string): string {
  const lowerKeyword = keyword.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  if (lowerKeyword === lowerSubject || lowerKeyword.includes(lowerSubject)) return keyword;
  if (lowerSubject.includes(lowerKeyword)) return subject;
  return `${keyword} "${subject}"`;
}

function normalizePlatforms(value: EventPlatform[] | undefined): EventPlatform[] {
  const requested = value?.filter(isEventPlatform) ?? [...EVENT_PLATFORMS];
  return [...new Set(requested)].length ? [...new Set(requested)] : [...EVENT_PLATFORMS];
}

function normalizeHashtags(values: string[]): string[] {
  return normalizeQuerySet(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `#${value.replace(/^#+/, '')}`),
    18
  );
}

function normalizeAccounts(values: string[]): string[] {
  return normalizeQuerySet(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `@${value.replace(/^@+/, '')}`),
    18
  );
}

function normalizeUrls(values: string[]): string[] {
  return normalizeQuerySet(values.map(trimUrl).filter(Boolean), 18);
}

function trimUrl(value: string): string {
  return value.trim().replace(/[),.;]+$/g, '');
}

function auditSteps(): VibesAuditStep[] {
  return [
    {
      id: 'brief.frontier',
      label: 'brief to frontier',
      status: 'ready',
      provider: 'aether-frontier',
      telemetry: ['briefHash', 'subjectKind', 'generatedTermCount'],
    },
    {
      id: 'frontier.review',
      label: 'creator term review',
      status: 'needs-review',
      provider: 'human',
      telemetry: ['addedTerms', 'removedTerms', 'platforms'],
    },
    {
      id: 'corpus.collect',
      label: 'collect references',
      status: 'planned',
      provider: 'event-recap-providers',
      telemetry: ['runId', 'querySet', 'sourceUrls', 'platformBudgets'],
    },
    {
      id: 'corpus.synthesize',
      label: 'cluster and summarize',
      status: 'planned',
      provider: 'aether-analysis',
      telemetry: ['themeIds', 'postIds', 'voiceIds', 'warnings'],
    },
    {
      id: 'report.publish',
      label: 'report and API',
      status: 'planned',
      provider: 'aether-api',
      telemetry: ['eventId', 'reportUrl', 'updatedAt'],
    },
  ];
}

function managedRuntimes(): VibesRuntimeAdapter[] {
  return [
    {
      provider: 'anthropic',
      status: 'available',
      label: 'Claude agent adapter',
      fit: 'Wired adapter for agentic frontier expansion. Not invoked — this plan uses the deterministic frontier planner.',
      auditHook: 'When enabled, would persist session id, tool calls, and environment version per run.',
    },
    {
      provider: 'openai',
      status: 'available',
      label: 'OpenAI agent adapter',
      fit: 'Wired adapter for agentic frontier expansion. Not invoked — this plan uses the deterministic frontier planner.',
      auditHook: 'When enabled, would persist response/run ids, trace ids, and tool-call items.',
    },
    {
      provider: 'aether',
      status: 'active',
      label: 'Aether frontier + event recap',
      fit: 'Active runtime: deterministic natural-language frontier planning, then multi-provider event recap collection and clustering.',
      auditHook: 'Persists query sets, source refs, run events, clusters, top voices, and exported report provenance.',
    },
  ];
}
