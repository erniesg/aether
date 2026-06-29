import Anthropic from '@anthropic-ai/sdk';
import type { MotionSourceBundleEditFile } from '@/lib/motion/sourceBundleApply';
import type {
  MotionSourceAuthorProvider,
  MotionSourceAuthorRequest,
  MotionSourceAuthorResult,
} from './types';

const PROVIDER_ID = 'anthropic-source-author';
const TOOL_NAME = 'author_motion_source_patch';

const SYSTEM_PROMPT = [
  'You are the motion-source author inside aether, a creator-first canvas tool.',
  'Edit only the supplied Remotion/HyperFrames source files for the requested motion variation.',
  'Return edited source files through the tool call only.',
  'Do not invent files, ids, provider names, or external assets.',
].join('\n');

const AUTHOR_SOURCE_PATCH_TOOL: Anthropic.Messages.Tool = {
  name: TOOL_NAME,
  description:
    'Return edited motion source files for a creator-reviewed source patch variation.',
  input_schema: {
    type: 'object',
    required: ['files'],
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'contents'],
          properties: {
            path: { type: 'string' },
            contents: { type: 'string' },
          },
        },
      },
    },
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export interface AnthropicMotionSourceAuthorClient {
  messages: {
    create(input: unknown): Promise<{
      content: Array<{
        type: string;
        name?: string;
        input?: unknown;
      }>;
    }>;
  };
}

export interface AnthropicMotionSourceAuthorOptions {
  apiKey?: string;
  model?: string;
  client?: AnthropicMotionSourceAuthorClient;
  maxTokens?: number;
}

export function createAnthropicMotionSourceAuthorProvider(
  options: AnthropicMotionSourceAuthorOptions
): MotionSourceAuthorProvider {
  const apiKey = envValue(options.apiKey);
  const model = envValue(options.model);

  return {
    id: PROVIDER_ID,
    displayName: 'Anthropic source author',
    available: () => Boolean(apiKey && model),
    async author(req: MotionSourceAuthorRequest): Promise<MotionSourceAuthorResult> {
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
      if (!model) throw new Error('AETHER_MOTION_SOURCE_AUTHOR_MODEL not set');

      const client =
        options.client ?? (new Anthropic({ apiKey }) as unknown as AnthropicMotionSourceAuthorClient);
      const msg = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 8192,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [AUTHOR_SOURCE_PATCH_TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: authoringPrompt(req) }],
          },
        ],
      });

      const toolBlock = msg.content.find(isAuthorToolBlock);
      if (!toolBlock) {
        throw new Error('Anthropic source author did not emit an author_motion_source_patch tool call');
      }

      return {
        providerId: PROVIDER_ID,
        files: parseAuthoredFiles(toolBlock.input, req),
        provenance: [{ kind: 'provider', ref: `${PROVIDER_ID}:${model}` }],
      };
    },
  };
}

function authoringPrompt(req: MotionSourceAuthorRequest): string {
  return [
    `Request: ${req.label}`,
    `Request id: ${req.id}`,
    `Variant: ${req.variantId}`,
    `Source edit id: ${req.sourceEditId}`,
    `Target clips: ${req.targetClipIds.join(', ') || 'none'}`,
    '',
    'Creator prompt:',
    req.prompt,
    '',
    'Guardrails:',
    ...req.guardrails.map((guardrail) => `- ${guardrail}`),
    '',
    'Expected response schema:',
    JSON.stringify(req.responseSchema),
    '',
    'Source files:',
    ...req.sourceFiles.map(formatSourceFile),
  ].join('\n');
}

function formatSourceFile(file: MotionSourceBundleEditFile): string {
  return [`<source-file path="${file.path}">`, '```', file.contents, '```', '</source-file>'].join(
    '\n'
  );
}

function isAuthorToolBlock(block: {
  type: string;
  name?: string;
  input?: unknown;
}): block is { type: 'tool_use'; name: typeof TOOL_NAME; input: unknown } {
  return block.type === 'tool_use' && block.name === TOOL_NAME;
}

function parseAuthoredFiles(
  input: unknown,
  req: MotionSourceAuthorRequest
): MotionSourceBundleEditFile[] {
  if (!isObject(input)) {
    throw new Error('Anthropic source author tool input must be an object');
  }

  const files = input.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Anthropic source author must return at least one source file');
  }

  const allowedPaths = new Set(req.sourceFiles.map((file) => file.path));
  const seenPaths = new Set<string>();

  return files.map((file, index) => {
    if (!isObject(file)) {
      throw new Error(`Anthropic source author file ${index} must be an object`);
    }

    const path = typeof file.path === 'string' ? file.path.trim() : '';
    const contents = typeof file.contents === 'string' ? file.contents : undefined;
    if (!path || contents === undefined) {
      throw new Error(`Anthropic source author file ${index} requires path and contents`);
    }
    if (!allowedPaths.has(path)) {
      throw new Error(`Anthropic source author returned unsupported source file ${path}`);
    }
    if (seenPaths.has(path)) {
      throw new Error(`Anthropic source author returned duplicate source file ${path}`);
    }
    seenPaths.add(path);

    return { path, contents };
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
