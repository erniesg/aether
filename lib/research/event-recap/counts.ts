import { deriveExpansionPlan } from './expand';
import { deriveSeedFrontier } from './frontier';
import { getEventBundle } from './store';
import {
  countPlatformViaTinyFishSearch,
  diagnoseLinkedInVault,
  isTinyFishAgentRunError,
  scrapePlatformFrontierViaTinyFish,
} from './tinyfish';
import type { EventPlatform } from './types';
import { countXRecentQueries } from './x-api';

export type LinkedInCountMode = 'search-index' | 'browser-direct';

export interface EventCountEstimateInput {
  eventId?: string;
  eventName?: string;
  contextHint?: string;
  querySet?: string[];
  platforms?: EventPlatform[];
  windowStart?: string;
  windowEnd?: string;
  maxQueries?: number;
  maxItems?: number;
  linkedinMode?: LinkedInCountMode;
  syncVault?: boolean;
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
    if (platform === 'linkedin' && input.linkedinMode === 'browser-direct') {
      estimates.push(
        await countLinkedInViaTinyFishBrowser({
          querySet,
          windowStart,
          windowEnd,
          maxQueries: input.maxQueries,
          maxItems: clampLinkedInBrowserMaxItems(input.maxItems),
          syncVault: input.syncVault,
        })
      );
    } else {
      estimates.push(
        await countPlatformViaTinyFishSearch({
          platform,
          querySet,
          maxQueries: input.maxQueries,
        })
      );
    }
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

async function countLinkedInViaTinyFishBrowser(input: {
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxQueries?: number;
  maxItems: number;
  syncVault?: boolean;
}) {
  const credentialItemIds = linkedinCredentialItemIds();
  let vault: Awaited<ReturnType<typeof diagnoseLinkedInVault>> | { ready: true; warnings: string[] };
  try {
    vault = await diagnoseLinkedInVault({
      credentialItemIds,
      sync: input.syncVault,
    });
  } catch (err) {
    vault = {
      ready: true,
      warnings: [`TinyFish Vault diagnostic failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (vault.ready === false) {
    return {
      platform: 'linkedin' as const,
      mode: 'browser-direct' as const,
      status: 'vault_not_ready' as const,
      estimates: [],
      totalLowerBound: 0,
      urls: [],
      samples: [],
      vault,
      warnings: vault.warnings,
    };
  }

  let result;
  try {
    result = await scrapePlatformFrontierViaTinyFish({
      platform: 'linkedin',
      querySet: input.querySet,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      maxItems: input.maxItems,
      maxQueries: input.maxQueries,
      credentialItemIds,
    });
  } catch (err) {
    if (isTinyFishAgentRunError(err)) {
      const vaultWarnings = diagnosticWarnings(vault);
      return {
        platform: 'linkedin' as const,
        mode: 'browser-direct' as const,
        status: err.needsHumanVerification ? 'needs_human_verification' : 'failed',
        estimates: [],
        totalLowerBound: 0,
        urls: [],
        samples: [],
        streamingUrl: err.streamingUrl,
        vault,
        warnings: [
          ...vaultWarnings,
          err.needsHumanVerification
            ? 'LinkedIn requested human verification in the TinyFish browser session. Open the streaming URL, complete the check, then rerun the browser-direct probe.'
            : err.message,
        ],
      };
    }
    throw err;
  }
  const byUrl = new Map(result.posts.map((post) => [post.url, post]));
  const vaultWarnings = diagnosticWarnings(vault);

  return {
    platform: 'linkedin' as const,
    mode: 'browser-direct' as const,
    status: 'completed' as const,
    estimates: browserQueryEstimates(result.raw),
    totalLowerBound: byUrl.size,
    urls: Array.from(byUrl.keys()),
    samples: Array.from(byUrl.values()).slice(0, 20).map((post) => ({
      url: post.url,
      authorName: post.authorName,
      authorHandle: post.authorHandle,
      authorUrl: post.authorUrl,
      postedAt: post.postedAt,
      text: post.text.slice(0, 280),
      metrics: post.metrics,
      tags: post.tags,
    })),
    streamingUrl: result.streamingUrl,
    vault,
    warnings: [
      ...vaultWarnings,
      'LinkedIn browser-direct counts are logged-in crawl lower bounds, not official platform totals.',
      'This mode spends TinyFish Agent credits because it searches LinkedIn directly through the Vault session.',
      ...result.warnings,
    ],
  };
}

function clampLinkedInBrowserMaxItems(value: number | undefined): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 100;
  return Math.max(1, Math.min(1000, Math.round(n)));
}

function diagnosticWarnings(value: { warnings?: unknown }): string[] {
  return Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
}

function browserQueryEstimates(raw: unknown): Array<{ source: string; query: string; count: number }> {
  if (!raw || typeof raw !== 'object') return [];
  const queries = (raw as Record<string, unknown>).queries;
  if (!Array.isArray(queries)) return [];
  return queries
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const query = typeof item.query === 'string' ? item.query : '';
      const count = typeof item.posts === 'number' && Number.isFinite(item.posts) ? item.posts : 0;
      return { source: query, query, count };
    });
}

function linkedinCredentialItemIds(): string[] | undefined {
  const raw = process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS?.trim();
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
