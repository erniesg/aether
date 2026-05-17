import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'get_event_top_voices',
  description:
    'Rank top voices in a stored event recap by platform-normalized reach, post count, and engagement.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Event recap id, e.g. "ai-engineer-summit-singapore".',
      },
      limit: {
        type: 'number',
        description: 'Maximum voices to return. Default 10.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const getEventTopVoices: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-top-voices',
    path: '/api/events/top-voices',
    provider: 'convex',
    model: 'event-recap-voices',
    toBody: (input) => {
      const i = input as { eventId: string; limit?: number };
      return { eventId: i.eventId, limit: i.limit ?? 10 };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const voices = Array.isArray(o.voices) ? (o.voices as Array<Record<string, unknown>>) : [];
    return JSON.stringify({
      ok: o.ok,
      voices: voices.slice(0, 10).map((voice) => ({
        platform: voice.platform,
        name: voice.name,
        handle: voice.handle,
        profileUrl: voice.profileUrl,
        postCount: voice.postCount,
        totalEngagement: voice.totalEngagement,
        reachScore: voice.reachScore,
        samplePostUrls: voice.samplePostUrls,
      })),
    });
  },
};
