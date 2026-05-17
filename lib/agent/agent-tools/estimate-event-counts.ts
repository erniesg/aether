import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'estimate_event_counts',
  description:
    'Estimate how many matching public posts exist across X and LinkedIn/search-index before scraping. Returns per-query counts with platform caveats.',
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
