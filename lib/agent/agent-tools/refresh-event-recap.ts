import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'refresh_event_recap',
  description:
    'Delta-refresh an event recap corpus. Uses stored posts as a seen set, then fills toward targetItemsPerPlatform without re-fetching already archived X/LinkedIn URLs. LinkedIn defaults to TinyFish Search+Fetch for lower cost; browser-direct is only for logged-in probes.',
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
          'LinkedIn Search+Fetch only: max TinyFish Search pages per query before fetching unseen URLs. Default 2.',
      },
      linkedinMode: {
        type: 'string',
        enum: ['search-fetch', 'browser-direct'],
        description:
          'LinkedIn collection mode. search-fetch is cheaper and skips seen URLs before Fetch; browser-direct spends Agent credits and may require warm_linkedin_session.',
      },
      includeMedia: {
        type: 'boolean',
        description: 'When true, ask TinyFish Fetch for image links and keep likely post-content media.',
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
