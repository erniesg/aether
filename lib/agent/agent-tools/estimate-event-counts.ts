import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'estimate_event_counts',
  description:
    'Estimate how many matching public posts exist across X and LinkedIn before scraping. LinkedIn can use cheap search-index estimates or a logged-in TinyFish/Vault browser probe.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Optional stored event recap id.' },
      eventName: { type: 'string', description: 'Event/topic name if no stored event id exists.' },
      contextHint: { type: 'string', description: 'Optional context for seed frontier generation.' },
      querySet: { type: 'array', items: { type: 'string' }, description: 'Optional explicit queries.' },
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['x', 'linkedin'] },
        description: 'Platforms to estimate. Defaults to both.',
      },
      windowStart: { type: 'string', description: 'Optional ISO start time.' },
      windowEnd: { type: 'string', description: 'Optional ISO end time.' },
      maxQueries: { type: 'number', description: 'Maximum queries to estimate. Default 12.' },
      maxItems: {
        type: 'number',
        description:
          'Maximum LinkedIn posts to collect when linkedinMode is browser-direct. Default 100.',
      },
      linkedinMode: {
        type: 'string',
        enum: ['search-index', 'browser-direct'],
        description:
          'LinkedIn counting mode. search-index is cheap and undercounts; browser-direct logs into LinkedIn through TinyFish Vault and returns a crawl lower bound. If LinkedIn asks for verification, call warm_linkedin_session to get an interactive inspectorUrl; streamingUrl is read-only preview only.',
      },
      syncVault: {
        type: 'boolean',
        description:
          'When true, sync TinyFish Vault items before LinkedIn browser-direct mode. Use after changing credential domains or password manager entries.',
      },
    },
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const estimateEventCounts: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-count-estimates',
    path: '/api/events/counts',
    provider: 'x-and-tinyfish',
    model: 'event-count-estimator',
    toBody: (input) => input,
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const counts = o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : {};
    return JSON.stringify({
      ok: o.ok,
      eventName: counts.eventName,
      querySet: counts.querySet,
      estimates: counts.estimates,
      warnings: counts.warnings,
    });
  },
};
