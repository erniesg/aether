/**
 * draftManifest.ts — AC5 step 1: factory-driven SKILL.md drafter.
 *
 * Given a creator's natural-language description ("write a skill that
 * neon-drenches any image on the canvas"), call Claude Opus 4.7 once via
 * tool-use to produce a complete `SkillManifest`. The caller then renders the
 * draft for accept/reject and — on accept — writes it to disk.
 *
 * Per hard rule #7 (provider-agnostic AI) the model is resolved from the
 * environment via `CLAUDE_DRAFT_SKILL_MODEL` → `CLAUDE_MODEL` → default.
 *
 * `bypassAgent: true` and missing-API-key paths return a deterministic local
 * fallback so e2e tests + offline demos do not require Anthropic credentials.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SkillManifest } from './types';

const DEFAULT_MODEL = 'claude-opus-4-7';

export const DRAFT_SKILL_SYSTEM_PROMPT = [
  'You are the AI co-creator inside aether, a canvas-native creative system.',
  'Your task in this call: take a creator-authored natural-language description',
  'of a creative move and distil it into a complete SKILL.md manifest the creator',
  'can pin as a reusable capability on the canvas.',
  '',
  'A SKILL.md captures:',
  '  • name              — kebab-case identifier, 2-4 words, evocative of the move',
  '                         (e.g. `neon-drench`, `vertical-story-crop`, `soft-key-relight`).',
  '  • version           — always 1 for a fresh draft.',
  '  • description       — one short sentence describing what the skill does.',
  '  • tools[]           — declarative list of Anthropic tool NAMES the skill may',
  '                         call. Use snake_case names that match the names supplied',
  '                         to callSkill via toolRegistry. Empty array is fine.',
  '  • referenceFiles[]  — paths relative to the skill directory pointing to',
  '                         supporting files (snippets, examples). Empty array if',
  '                         the skill needs no reference files.',
  '  • instructions      — the full markdown body of SKILL.md (after front-matter).',
  '                         MUST include an "## Output format" section with a JSON',
  '                         contract showing `{ "ok": true, "result": ... }` so the',
  '                         executor can parse the result deterministically.',
  '',
  'Operating principles:',
  '  • Call the draft_skill_manifest tool exactly once, then stop.',
  '  • Prefer terse, descriptive names over clever ones; the creator can edit.',
  '  • Do not hardcode a provider, model, or vendor name in the body. Routing is a',
  '    runtime concern handled by the caller.',
  '  • The instructions body is the canonical execution spec — write it so a fresh',
  '    Claude session, given only the SKILL.md and the input, can execute the move.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

export const DRAFT_SKILL_MANIFEST_TOOL: Tool = {
  name: 'draft_skill_manifest',
  description:
    'Draft a complete SKILL.md manifest for a new skill the creator wants to pin. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'kebab-case identifier (2-4 words), e.g. "neon-drench"',
      },
      version: { type: 'number', description: 'Always 1 for a fresh draft.' },
      description: {
        type: 'string',
        description: 'One short sentence describing what the skill does.',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Declarative list of tool names the skill may call. Empty array if none.',
      },
      referenceFiles: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Paths relative to the skill directory for any supporting files. Empty array if none.',
      },
      instructions: {
        type: 'string',
        description:
          'The full markdown body of SKILL.md (after front-matter), including an "## Output format" section that documents the JSON contract.',
      },
    },
    required: ['name', 'version', 'description', 'instructions'],
  } as unknown as Tool['input_schema'],
};

export interface DraftSkillManifestOptions {
  prompt: string;
  /** Skip the Claude call; return a deterministic local fallback. */
  bypassAgent?: boolean;
  /** Override the Anthropic client (tests). */
  client?: Anthropic;
  /** Override the model. Defaults to env vars or claude-opus-4-7. */
  model?: string;
}

export function parseDraftToolInput(value: unknown): SkillManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('draft_skill_manifest tool input was not an object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.trim() === '') {
    throw new Error('draft_skill_manifest required: name');
  }
  if (typeof v.description !== 'string' || v.description.trim() === '') {
    throw new Error('draft_skill_manifest required: description');
  }
  if (typeof v.instructions !== 'string' || v.instructions.trim() === '') {
    throw new Error('draft_skill_manifest required: instructions');
  }
  const version = typeof v.version === 'number' ? v.version : 1;
  const tools = Array.isArray(v.tools)
    ? (v.tools as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const referenceFiles = Array.isArray(v.referenceFiles)
    ? (v.referenceFiles as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  return {
    name: kebabCase(v.name.trim()),
    version,
    description: v.description.trim(),
    tools,
    referenceFiles,
    instructions: v.instructions.trim(),
  };
}

function kebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .join('-');
}

function shouldFallback(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /ANTHROPIC_API_KEY not set/i.test(message) ||
    /credit balance is too low/i.test(message) ||
    /invalid_request_error/i.test(message) ||
    /authentication/i.test(message) ||
    /permission/i.test(message) ||
    /billing/i.test(message)
  );
}

function buildMessages(prompt: string): Anthropic.Messages.MessageParam[] {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Draft a SKILL.md for the following move:',
            '',
            prompt.trim(),
          ].join('\n'),
        },
      ],
    },
  ];
}

export async function draftSkillManifest(
  opts: DraftSkillManifestOptions
): Promise<SkillManifest> {
  if (opts.bypassAgent) return localFallback(opts.prompt);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.client) return localFallback(opts.prompt);

  const model =
    opts.model ??
    process.env.CLAUDE_DRAFT_SKILL_MODEL ??
    process.env.CLAUDE_MODEL ??
    DEFAULT_MODEL;
  const client = opts.client ?? new Anthropic({ apiKey: apiKey! });

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: DRAFT_SKILL_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [DRAFT_SKILL_MANIFEST_TOOL],
      tool_choice: { type: 'tool', name: DRAFT_SKILL_MANIFEST_TOOL.name },
      messages: buildMessages(opts.prompt),
    });
  } catch (err) {
    if (shouldFallback(err)) return localFallback(opts.prompt);
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === DRAFT_SKILL_MANIFEST_TOOL.name
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a draft_skill_manifest tool call');
  }
  return parseDraftToolInput(toolBlock.input);
}

/**
 * Deterministic offline draft. Used when bypassAgent is true, when the
 * Anthropic key is missing, or when Claude raises an auth/billing error.
 *
 * Strips any leading "write/author/pin/create a skill that" phrasing so the
 * derived name describes the move itself.
 */
function localFallback(prompt: string): SkillManifest {
  const stripped = prompt
    .trim()
    .replace(
      /^(write|author|pin|create|draft|make|build)\s+(a\s+|the\s+)?skill\s+(that|to|which)?\s*/i,
      ''
    )
    .trim();
  const id =
    kebabCase(stripped.split(/\s+/).slice(0, 4).join(' ')) ||
    `draft-skill-${Date.now().toString(36)}`;
  const description = stripped
    ? `Apply: ${stripped.slice(0, 120)}`
    : 'Custom creator-authored skill.';
  const instructions = [
    `# ${id}`,
    '',
    description,
    '',
    '## Input shape',
    '',
    '```json',
    '{ "imageUrl": "<url of the layer>", "params": { } }',
    '```',
    '',
    '## Instructions',
    '',
    `1. Read the input image.`,
    `2. Apply the move described above.`,
    `3. Return the resulting image URL in the structured output.`,
    '',
    '## Output format',
    '',
    '```json',
    '{ "ok": true, "result": { "imageUrl": "<resulting image url>" } }',
    '```',
    '',
    'On error return `{ "ok": false, "result": null, "error": "message" }`.',
  ].join('\n');

  return {
    name: id,
    version: 1,
    description,
    tools: [],
    referenceFiles: [],
    instructions,
  };
}
