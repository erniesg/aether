import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'get_event_expansion_plan',
  description:
    'Inspect a stored mixed X + LinkedIn event corpus and suggest the next search frontier: accounts, hashtags, entities, corpus phrase clues, and expanded queries, with cited sample post ids.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Event recap id, e.g. "ai-engineer-summit-singapore".',
      },
      maxAnchors: {
        type: 'number',
        description: 'Maximum expansion anchors to return. Default 20.',
      },
      maxQueries: {
        type: 'number',
        description: 'Maximum expanded queries to return. Default 12.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const getEventExpansionPlan: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-expansion-plan',
    path: '/api/events/expansion-plan',
    provider: 'convex',
    model: 'event-recap-expansion',
    toBody: (input) => {
      const i = input as {
        eventId: string;
        maxAnchors?: number;
        maxQueries?: number;
      };
      return {
        eventId: i.eventId,
        maxAnchors: i.maxAnchors ?? 20,
        maxQueries: i.maxQueries ?? 12,
      };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const plan = o.plan && typeof o.plan === 'object' ? (o.plan as Record<string, unknown>) : {};
    const anchors = Array.isArray(plan.anchors)
      ? (plan.anchors as Array<Record<string, unknown>>)
      : [];
    return JSON.stringify({
      ok: o.ok,
      corpus: plan.corpus,
      querySet: plan.querySet,
      warnings: plan.warnings,
      anchors: anchors.slice(0, 12).map((anchor) => ({
        kind: anchor.kind,
        sourceKind: anchor.sourceKind,
        value: anchor.value,
        query: anchor.query,
        score: anchor.score,
        count: anchor.count,
        platforms: anchor.platforms,
        samplePostIds: anchor.samplePostIds,
        bias: anchor.bias,
        reason: anchor.reason,
      })),
    });
  },
};
