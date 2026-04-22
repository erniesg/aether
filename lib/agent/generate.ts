import Anthropic from '@anthropic-ai/sdk';
import type { AspectRatio, ImageGenResult, ImageRef } from '@/lib/providers/image/types';
import { resolveProvider } from '@/lib/providers/image/registry';

/**
 * Phase 4 agent loop: Claude Opus 4.7 plans the generation, calls the
 * `generate_image` tool with concrete parameters, and the provider registry
 * routes to whichever adapter is configured/available.
 *
 * The loop is intentionally thin — Phase 5 extends it with multi-tool
 * planning (edit, cutout, relight) and the capability-definition author
 * pathway. For Phase 4 we only need prompt → plan → image → canvas.
 */

export const CLAUDE_MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = [
  'You are the AI co-creator inside aether, a canvas-native creative system.',
  'Your job: turn a creator\'s natural-language request into a concrete image-generation call.',
  '',
  'Operating principles:',
  '- You are not a chatbot. You plan, you call a tool, you stop.',
  '- Default aspect ratio is 1:1 unless the creator names a format (story/reel/vertical → 9:16; wide/banner → 16:9; post → 1:1; pin → 4:5).',
  '- Write prompts that are visually specific: subject, composition, lighting, colour, style. Keep under 220 chars.',
  '- When the creator has pinned references, treat them as visual anchors — reflect the refs in your prompt rather than inventing new directions.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

const TOOL_GENERATE_IMAGE: Tool = {
  name: 'generate_image',
  description:
    'Generate an image from a text prompt. Use an aspect ratio that matches the creator\'s intended format. Keep the prompt specific and visually grounded.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The rewritten, visually-specific prompt.' },
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'],
        description: 'Aspect ratio token. Square post → 1:1. IG portrait → 4:5. Vertical story/reel → 9:16. Portrait → 3:4 or 2:3. Landscape → 4:3 or 3:2. Wide/banner → 16:9.',
      },
      seed: { type: 'number', description: 'Optional seed for reproducibility.' },
      rationale: {
        type: 'string',
        description: 'One short sentence explaining the creative choice made.',
      },
    },
    required: ['prompt', 'aspectRatio'],
  } as unknown as Tool['input_schema'],
};

export interface GenerateParams {
  prompt: string;
  refs?: ImageRef[];
  providerId?: string;
  model?: string;
  /** Skip the Claude planning call; pipe the prompt straight through. */
  bypassAgent?: boolean;
  /** Override the aspect ratio delivered to the provider. Used by the fan-out
   * path — one Claude call rewrites the prompt, then N provider calls render
   * that prompt into N different artboard ratios. Claude's own aspectRatio
   * choice is ignored when this is set. */
  aspectRatioOverride?: AspectRatio;
}

export interface GenerateOutcome {
  plan: {
    rewrittenPrompt: string;
    aspectRatio: string;
    rationale?: string;
    seed?: number;
  };
  result: ImageGenResult;
  provider: { id: string; displayName: string; model: string };
}

export interface GeneratePlan {
  rewrittenPrompt: string;
  aspectRatio: AspectRatio;
  rationale?: string;
  seed?: number;
}

export interface GenerateProviderInfo {
  id: string;
  displayName: string;
  model: string;
}

const RATIO_SET = ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'] as const;
type RatioLiteral = (typeof RATIO_SET)[number];

function stringifyToolInput(value: unknown): {
  prompt: string;
  aspectRatio: RatioLiteral;
  seed?: number;
  rationale?: string;
} {
  if (typeof value !== 'object' || value === null) {
    throw new Error('generate_image tool input was not an object');
  }
  const v = value as Record<string, unknown>;
  const prompt = typeof v.prompt === 'string' ? v.prompt : undefined;
  const rawRatio = typeof v.aspectRatio === 'string' ? v.aspectRatio : undefined;
  if (!prompt) throw new Error('generate_image required: prompt');
  if (!rawRatio || !(RATIO_SET as readonly string[]).includes(rawRatio)) {
    throw new Error(`generate_image required: aspectRatio in ${RATIO_SET.join(', ')}`);
  }
  return {
    prompt,
    aspectRatio: rawRatio as RatioLiteral,
    seed: typeof v.seed === 'number' ? v.seed : undefined,
    rationale: typeof v.rationale === 'string' ? v.rationale : undefined,
  };
}

function resolveGenerateContext(params: GenerateParams): {
  provider: ReturnType<typeof resolveProvider>;
  providerInfo: GenerateProviderInfo;
} {
  // Thread `params.model` as a hint so `?model=gpt-image-2` routes to
  // whichever provider lists that model when no provider is specified.
  const provider = resolveProvider(params.providerId, params.model);
  const model = params.model ?? provider.listModels()[0];
  return {
    provider,
    providerInfo: { id: provider.id, displayName: provider.displayName, model },
  };
}

async function createGeneratePlan(params: GenerateParams): Promise<GeneratePlan> {
  if (params.bypassAgent) {
    const aspectRatio = params.aspectRatioOverride ?? '1:1';
    return { rewrittenPrompt: params.prompt, aspectRatio };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [TOOL_GENERATE_IMAGE],
    tool_choice: { type: 'tool', name: 'generate_image' },
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: params.prompt }],
      },
    ],
  });

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'generate_image'
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a generate_image tool call');
  }

  const plan = stringifyToolInput(toolBlock.input);
  // Fan-out overrides Claude's aspect ratio so the same rewritten prompt can
  // render into every linked artboard at the right shape. Claude's suggestion
  // still flows back as metadata when no override is set.
  const effectiveAspect = params.aspectRatioOverride ?? plan.aspectRatio;
  return {
    rewrittenPrompt: plan.prompt,
    aspectRatio: effectiveAspect,
    rationale: plan.rationale,
    seed: plan.seed,
  };
}

export async function planGenerate(params: GenerateParams): Promise<{
  plan: GeneratePlan;
  provider: GenerateProviderInfo;
}> {
  const { providerInfo } = resolveGenerateContext(params);
  const plan = await createGeneratePlan(params);
  return { plan, provider: providerInfo };
}

export async function runGenerate(params: GenerateParams): Promise<GenerateOutcome> {
  const { provider, providerInfo } = resolveGenerateContext(params);
  const plan = await createGeneratePlan(params);
  const result = await provider.generate(
    {
      prompt: plan.rewrittenPrompt,
      refs: params.refs,
      aspectRatio: plan.aspectRatio,
      seed: plan.seed,
    },
    { model: providerInfo.model }
  );

  return {
    plan,
    result,
    provider: providerInfo,
  };
}
