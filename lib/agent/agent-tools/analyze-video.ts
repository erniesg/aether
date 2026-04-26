import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'analyze_video',
  description:
    'Send a video URL to Gemini for understanding. Use task=summarize for a quick brief, transcribe for spoken dialogue, extract-moments for visual peaks, describe-shots for camera work.',
  input_schema: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: 'Direct URL to the video file (mp4, mov, webm, etc.).',
      },
      task: {
        type: 'string',
        enum: [
          'summarize',
          'transcribe',
          'extract-moments',
          'describe-shots',
          'free-form',
        ],
        description: 'Default summarize.',
      },
      prompt: {
        type: 'string',
        description: 'Optional override prompt; only used when task=free-form.',
      },
    },
    required: ['videoUrl'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const analyzeVideo: AgentTool = {
  tool,
  dispatch: {
    registryId: 'video-understand',
    path: '/api/video-understand',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    toBody: (input) => input,
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      const model = typeof o?.modelId === 'string' ? (o.modelId as string) : undefined;
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
      modelId: o.modelId,
      text: o.text,
      usageMs: o.usageMs,
    });
  },
};
