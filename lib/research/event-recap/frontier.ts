import type { EventExpansionAnchor, EventExpansionPlan } from './types';
import { normalizeQuerySet } from './utils';

interface SeedFrontierInput {
  eventName: string;
  contextHint?: string;
  officialUrl?: string;
  sourceUrls?: string[];
  maxQueries?: number;
}

export function deriveSeedFrontier(input: SeedFrontierInput): EventExpansionPlan {
  const maxQueries = input.maxQueries ?? 12;
  const eventName = input.eventName.trim();
  const context = input.contextHint?.trim();
  const anchors: EventExpansionAnchor[] = [
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: eventName,
      query: eventName,
      score: 80,
      bias: 'literal event-name search; high precision but often low recall',
    }),
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: `"${eventName}"`,
      query: `"${eventName}"`,
      score: 78,
      bias: 'exact phrase search; useful for canonical mentions, usually misses casual posts',
    }),
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: `${eventName} Singapore`,
      query: `${eventName} Singapore`,
      score: 74,
      bias: 'location-constrained keyword search; may over-sample event listings',
    }),
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: '"AI engineer" Singapore',
      query: '"AI engineer" Singapore',
      score: 68,
      bias: 'topic keyword search; mixes event conversation with general role/career posts',
    }),
  ];

  if (/\bai\s*engineer\b/i.test(eventName)) {
    anchors.push(
      anchor({
        kind: 'mention',
        sourceKind: 'official-schedule',
        value: '@aiDotEngineer',
        query: '@aiDotEngineer Singapore',
        score: 90,
        bias: 'organizer-biased; strong for discovery but announcement-heavy',
      }),
      anchor({
        kind: 'hashtag',
        sourceKind: 'broad-public-search',
        value: '#aiengineer',
        query: '#aiengineer Singapore',
        score: 62,
        bias: 'hashtag-biased; useful when attendees use official tags',
      })
    );
  }

  if (context) {
    for (const phrase of contextPhrases(context).slice(0, 4)) {
      anchors.push(
        anchor({
          kind: 'query',
          sourceKind: 'broad-public-search',
          value: phrase,
          query: `${phrase} ${eventName}`,
          score: 40,
          bias: 'context-derived keyword; validate with corpus before summarizing',
        })
      );
    }
  }

  const sourceDomains = new Set(
    [input.officialUrl, ...(input.sourceUrls ?? [])]
      .filter((url): url is string => Boolean(url))
      .map(domainFromUrl)
      .filter((domain): domain is string => Boolean(domain))
  );
  for (const domain of sourceDomains) {
    anchors.push(
      anchor({
        kind: 'entity',
        sourceKind: 'official-schedule',
        value: domain,
        query: `${domain} "${eventName}"`,
        score: 30,
        bias: 'official-source-derived; useful for speaker/sponsor discovery, not sentiment',
      })
    );
  }

  const querySet = normalizeQuerySet(
    anchors.sort((a, b) => b.score - a.score).map((item) => item.query),
    maxQueries
  );

  return {
    eventName,
    generatedAt: Date.now(),
    corpus: { posts: 0, platforms: { x: 0, linkedin: 0 } },
    anchors,
    querySet,
    warnings: ['Seed frontier has no corpus yet; use it for recall, then re-rank from scraped posts.'],
  };
}

function anchor(
  input: Omit<EventExpansionAnchor, 'count' | 'platforms' | 'samplePostIds' | 'reason'>
): EventExpansionAnchor {
  return {
    ...input,
    count: 0,
    platforms: [],
    samplePostIds: [],
    reason: `${input.sourceKind} seed`,
  };
}

function contextPhrases(context: string): string[] {
  return normalizeQuerySet(
    context
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && part.length <= 80),
    8
  );
}

function domainFromUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host || undefined;
  } catch {
    return undefined;
  }
}
