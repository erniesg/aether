import { deriveExpansionPlan } from './expand';
import { deriveSeedFrontier } from './frontier';
import { getEventBundle } from './store';
import { countPlatformViaTinyFishSearch } from './tinyfish';
import type { EventPlatform } from './types';
import { countXRecentQueries } from './x-api';

export interface EventCountEstimateInput {
  eventId?: string;
  eventName?: string;
  contextHint?: string;
  querySet?: string[];
  platforms?: EventPlatform[];
  windowStart?: string;
  windowEnd?: string;
  maxQueries?: number;
}

export async function estimateEventCounts(input: EventCountEstimateInput) {
  const bundle = input.eventId ? await getEventBundle(input.eventId) : null;
  const eventName =
    input.eventName ?? bundle?.event.canonicalName ?? bundle?.event.name ?? input.eventId ?? 'event';
  const querySet =
    input.querySet && input.querySet.length
      ? input.querySet
      : bundle?.posts.length
        ? deriveExpansionPlan(eventName, bundle.posts, {
            baseQueries: bundle.event.querySet,
            maxQueries: input.maxQueries ?? 12,
          }).querySet
        : deriveSeedFrontier({
            eventName,
            contextHint: input.contextHint ?? bundle?.event.contextHint,
            officialUrl: bundle?.event.officialUrl,
            sourceUrls: bundle?.event.sourceUrls,
            maxQueries: input.maxQueries ?? 12,
          }).querySet;

  const windowStart =
    input.windowStart ??
    bundle?.runs[0]?.windowStart ??
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd =
    input.windowEnd ?? bundle?.runs[0]?.windowEnd ?? new Date(Date.now() - 60_000).toISOString();
  const platforms = input.platforms?.length ? input.platforms : (['x', 'linkedin'] as EventPlatform[]);
  const estimates = [];

  if (platforms.includes('x')) {
    estimates.push(
      await countXRecentQueries({
        querySet,
        windowStart,
        windowEnd,
        maxQueries: input.maxQueries,
      }, process.env)
    );
  }

  for (const platform of platforms.filter((platform) => platform !== 'x')) {
    estimates.push(
      await countPlatformViaTinyFishSearch({
        platform,
        querySet,
        maxQueries: input.maxQueries,
      })
    );
  }

  return {
    eventName,
    querySet,
    windowStart,
    windowEnd,
    estimates,
    warnings: [
      'Cross-platform totals are not additive because platforms expose different search/count semantics.',
      'Use counts to choose frontier budget, then rely on dedupe and conversation classification after scraping.',
    ],
  };
}
