import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'cluster_references',
  description:
    'Embed a batch of image URLs with CLIP ViT-B/32 and cluster with HDBSCAN + UMAP. Use after search_signals to group references into visual themes.',
  input_schema: {
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['id', 'url'],
        },
      },
      minClusterSize: {
        type: 'number',
        description: 'HDBSCAN tuning. Smaller finds tighter clusters. Default 3.',
      },
    },
    required: ['images'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const clusterReferences: AgentTool = {
  tool,
  dispatch: {
    registryId: 'clusters-run',
    path: '/api/clusters/run',
    provider: 'modal-clip',
    model: 'clip-vit-b32',
    toBody: (input) => input,
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      return provider ? { provider } : {};
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const items = (o.items as Array<Record<string, unknown>>) ?? [];
    return JSON.stringify({
      ok: o.ok,
      nClusters: o.nClusters,
      nNoise: o.nNoise,
      provider: o.provider,
      items: items.map((it) => ({
        id: it.id,
        clusterId: it.clusterId,
        umap: it.umap,
      })),
    });
  },
};
