import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'search_signals',
  description:
    'Scrape Pinterest / Instagram / TikTok / Xiaohongshu for visual references matching a creative brief. Returns the URL and metadata of each found post.',
  input_schema: {
    type: 'object',
    properties: {
      seedText: {
        type: 'string',
        description:
          'Creator brief or keyword. e.g. "streetwear lookbook" or "minimal kitchenware".',
      },
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['instagram', 'pinterest', 'tiktok', 'xiaohongshu'],
        },
        description: 'Platforms to scrape. Default: ["instagram"]',
      },
      limit: {
        type: 'number',
        description: 'Per-platform record cap. Default 12.',
      },
    },
    required: ['seedText'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const searchSignals: AgentTool = {
  tool,
  dispatch: {
    registryId: 'signals-search',
    path: '/api/research',
    provider: 'multi',
    model: 'signals-research',
    toBody: (input) => {
      const i = input as { seedText: string; platforms?: string[]; limit?: number };
      return {
        seedText: i.seedText,
        platforms: i.platforms ?? ['instagram'],
        limit: i.limit ?? 12,
      };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const records = (o.records as Array<Record<string, unknown>>) ?? [];
    return JSON.stringify({
      ok: o.ok,
      signalCount: o.signalCount,
      records: records.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        attribution: r.attribution,
        fullUrl: r.fullUrl,
        tags: r.tags,
      })),
    });
  },
};
