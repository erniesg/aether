import type Anthropic from '@anthropic-ai/sdk';
import { deriveSeedFrontier } from '@/lib/research/event-recap/frontier';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'generate_event_search_frontier',
  description:
    'Generate an initial event-search frontier before scraping: keyword queries, likely organizer/account anchors, source labels, and bias notes.',
  input_schema: {
    type: 'object',
    properties: {
      eventName: { type: 'string', description: 'Event or topic name.' },
      contextHint: {
        type: 'string',
        description: 'Optional extra context, speakers, location, or topic notes.',
      },
      officialUrl: { type: 'string', description: 'Optional official event URL.' },
      sourceUrls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional source URLs discovered by web search.',
      },
      maxQueries: { type: 'number', description: 'Maximum queries to return. Default 12.' },
    },
    required: ['eventName'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const generateEventSearchFrontier: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-search-frontier',
    provider: 'aether',
    model: 'event-frontier-heuristic',
    local: (input) => {
      const i = input as {
        eventName: string;
        contextHint?: string;
        officialUrl?: string;
        sourceUrls?: string[];
        maxQueries?: number;
      };
      return {
        ok: true,
        plan: deriveSeedFrontier({
          eventName: i.eventName,
          contextHint: i.contextHint,
          officialUrl: i.officialUrl,
          sourceUrls: i.sourceUrls,
          maxQueries: i.maxQueries,
        }),
      };
    },
  },
  summarizeOutput: (output) => JSON.stringify(output),
};
