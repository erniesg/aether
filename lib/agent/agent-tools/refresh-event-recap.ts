import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'refresh_event_recap',
  description:
    'Delta-refresh an event recap corpus. Uses stored posts as a seen set, then fills toward targetItemsPerPlatform without re-fetching already archived X/LinkedIn URLs. X can use official search or Apify; LinkedIn defaults to TinyFish Search+Fetch for lower cost; browser-direct is only for logged-in probes.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Stored event recap id, e.g. "ai-engineer-singapore".',
      },
      targetItemsPerPlatform: {
        type: 'number',
        description:
          'Desired stored corpus size per platform. Existing posts are counted first; only the missing delta is collected. Max 1000.',
      },
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['x', 'linkedin'] },
        description: 'Optional platform subset. Defaults to X and LinkedIn.',
      },
      maxItemsPerPlatform: {
        type: 'number',
        description:
          'Fallback per-run collection budget when targetItemsPerPlatform is not set.',
      },
      maxQueries: {
        type: 'number',
        description: 'Maximum expansion source queries to use. Default comes from the event settings.',
      },
      maxSearchPagesPerQuery: {
        type: 'number',
        description:
          'LinkedIn Search+Fetch only: max TinyFish Search pages per query before fetching unseen URLs. Default 2; capped at 11 because TinyFish page indexes stop at 10.',
      },
      linkedinMode: {
        type: 'string',
        enum: ['search-fetch', 'browser-direct'],
        description:
          'LinkedIn collection mode. search-fetch is cheaper and skips seen URLs before Fetch; browser-direct spends Agent credits and may require warm_linkedin_session.',
      },
      xProvider: {
        type: 'string',
        enum: ['official', 'apify'],
        description:
          'X collection provider. official uses the configured X API; apify uses the configured Apify X actor and normalizes likes/views/replies/media.',
      },
      apifyActorId: {
        type: 'string',
        description:
          'Optional Apify X actor id. Defaults to the Tweet Scraper V2 actor, 61RPP7dywgiy0JPD0.',
      },
      apifySort: {
        type: 'string',
        enum: ['Top', 'Latest', 'Latest + Top'],
        description: 'Apify X sort mode. Latest is cheaper/less overlapping; Latest + Top can increase recall but may duplicate.',
      },
      apifyCandidateMultiplier: {
        type: 'number',
        description:
          'Apify X over-collection multiplier before local dedupe. Default 1 for cost control; increase when seen-set overlap is high.',
      },
      includeMedia: {
        type: 'boolean',
        description:
          'When true, collect post-content media. LinkedIn Search+Fetch can only keep indexed feedshare images; LinkedIn browser-direct performs a richer logged-in post-card media pass and excludes page chrome/profile/cover assets.',
      },
      seenPostUrls: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional additional seen URLs to skip before expensive collection, useful for URLs already fetched and rejected as irrelevant/noise.',
      },
      dedupeAgainstExisting: {
        type: 'boolean',
        description: 'Defaults true. When true, skips already stored post URLs/ids before expensive fetches.',
      },
      liveMode: {
        type: 'string',
        enum: ['tinyfish', 'mock'],
        description: 'Execution mode. Use tinyfish for live collection.',
      },
      monthlyCreditBudget: {
        type: 'number',
        description: 'Optional budget guard; refresh is skipped if estimated live cost would exceed it.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const refreshEventRecap: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-recap-refresh',
    path: '/api/events/refresh',
    provider: 'x-and-tinyfish',
    model: 'event-recap-delta-refresh',
    toBody: (input) => input,
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const bundle = o.bundle && typeof o.bundle === 'object' ? (o.bundle as Record<string, unknown>) : {};
    const event = bundle.event && typeof bundle.event === 'object' ? (bundle.event as Record<string, unknown>) : {};
    const posts = Array.isArray(bundle.posts) ? (bundle.posts as Array<Record<string, unknown>>) : [];
    const runs = Array.isArray(bundle.runs) ? (bundle.runs as Array<Record<string, unknown>>) : [];
    const latestRun = runs[0] ?? {};
    const byPlatform = posts.reduce<Record<string, number>>((acc, post) => {
      const platform = typeof post.platform === 'string' ? post.platform : 'unknown';
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    }, {});
    return JSON.stringify({
      ok: o.ok,
      eventId: event.eventId,
      status: event.status,
      posts: posts.length,
      byPlatform,
      latestRun: {
        runId: latestRun.runId,
        status: latestRun.status,
        outputs: latestRun.outputs,
        warnings: latestRun.warnings,
      },
    });
  },
};
