import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'generate_image',
  description:
    'Render one hero image. The provider (OpenAI / Gemini / Replicate / Volcengine Seedream) is selected at runtime from env.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'Visually specific prompt. Subject, composition, light, colour, style. Under 220 chars.',
      },
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'],
        description:
          '1:1 default. IG portrait 4:5. Story/reel 9:16. Banner 16:9.',
      },
    },
    required: ['prompt', 'aspectRatio'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const generateImage: AgentTool = {
  tool,
  dispatch: {
    registryId: 'image-gen',
    path: '/api/generate',
    provider: 'auto',
    model: 'auto',
    toBody: (input) => {
      const i = input as { prompt: string; aspectRatio: string };
      return { prompt: i.prompt, aspectRatioOverride: i.aspectRatio };
    },
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      const plan = (o?.plan as Record<string, unknown> | undefined) ?? undefined;
      const model = typeof plan?.model === 'string' ? (plan.model as string) : undefined;
      return {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
      };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    return JSON.stringify({
      ok: o.ok,
      provider: o.provider,
      plan: o.plan,
      // strip the b64/data URL bytes
      result: o.result
        ? {
            width: (o.result as Record<string, unknown>).width,
            height: (o.result as Record<string, unknown>).height,
          }
        : null,
    });
  },
};
