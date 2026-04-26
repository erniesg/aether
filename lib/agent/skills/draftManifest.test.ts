/**
 * draftManifest.test.ts — AC5: factory-driven SKILL.md drafter.
 *
 * Verifies:
 *  - The Claude tool-use call is made with the expected system prompt + tool.
 *  - A successful tool_use response is parsed into a SkillManifest.
 *  - When `bypassAgent: true`, the drafter returns a deterministic local
 *    fallback manifest (used by tests + demos without an Anthropic key).
 *  - Missing required fields in tool input throw.
 */

import { describe, expect, it, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('@anthropic-ai/sdk');

import {
  DRAFT_SKILL_MANIFEST_TOOL,
  DRAFT_SKILL_SYSTEM_PROMPT,
  draftSkillManifest,
  parseDraftToolInput,
} from './draftManifest';

let mockCreate: MockedFunction<(...args: unknown[]) => unknown>;
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  // Force the live-API path so tests exercise the mocked Anthropic SDK rather
  // than the local fallback (which fires when no key is set).
  process.env.ANTHROPIC_API_KEY = 'sk-test-mock';
  mockCreate = vi.fn();
  const MockedAnthropic = Anthropic as unknown as {
    prototype: { messages: { create: typeof mockCreate } };
  };
  MockedAnthropic.prototype = { messages: { create: mockCreate } };
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

describe('draftSkillManifest', () => {
  it('returns a deterministic local fallback when bypassAgent is true', async () => {
    const manifest = await draftSkillManifest({
      prompt: 'write a skill that neon-drenches any image on the canvas',
      bypassAgent: true,
    });

    expect(manifest.name).toMatch(/^[a-z0-9-]+$/);
    expect(manifest.version).toBe(1);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.tools)).toBe(true);
    expect(Array.isArray(manifest.referenceFiles)).toBe(true);
    // The instructions body must be a non-empty markdown string.
    expect(manifest.instructions.length).toBeGreaterThan(20);
    // Must derive an `output format` section so the JSON contract is clear.
    expect(/output format/i.test(manifest.instructions)).toBe(true);
  });

  it('calls Claude with a draft_skill_manifest tool and parses the response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'draft_skill_manifest',
          id: 'toolu_01',
          input: {
            name: 'neon-drench',
            version: 1,
            description: 'Drench an image in neon light wash.',
            tools: ['image_edit'],
            referenceFiles: [],
            instructions:
              '# Neon drench\n\nApply a neon wash to the input image.\n\n## Output format\n\n```json\n{ "ok": true, "result": { "imageUrl": "..." } }\n```',
          },
        },
      ],
      usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 150 },
    });

    const manifest = await draftSkillManifest({
      prompt: 'write a skill that neon-drenches any image',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(callArg.tools).toBeDefined();
    expect((callArg.tools as Anthropic.Messages.Tool[])[0]!.name).toBe(DRAFT_SKILL_MANIFEST_TOOL.name);
    // System prompt contains the framing
    const systemBlocks = callArg.system as Anthropic.TextBlockParam[];
    expect(systemBlocks[0]!.text).toContain(DRAFT_SKILL_SYSTEM_PROMPT.slice(0, 40));

    expect(manifest.name).toBe('neon-drench');
    expect(manifest.tools).toEqual(['image_edit']);
    expect(manifest.instructions).toContain('Output format');
  });

  it('falls back locally when Claude raises an auth/billing error', async () => {
    mockCreate.mockRejectedValue(new Error('credit balance is too low'));

    const manifest = await draftSkillManifest({
      prompt: 'write a skill that crops to vertical story',
    });

    expect(manifest.name).toMatch(/^[a-z0-9-]+$/);
    expect(manifest.instructions.length).toBeGreaterThan(0);
  });

  it('throws when Claude omits the draft_skill_manifest tool call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'sorry, I cannot help' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await expect(
      draftSkillManifest({ prompt: 'write a skill that sketches the layout' })
    ).rejects.toThrow(/draft_skill_manifest/);
  });
});

describe('parseDraftToolInput', () => {
  it('rejects missing name', () => {
    expect(() =>
      parseDraftToolInput({ description: 'x', version: 1, instructions: 'y' })
    ).toThrow(/name/);
  });

  it('rejects empty instructions', () => {
    expect(() =>
      parseDraftToolInput({
        name: 'x',
        version: 1,
        description: 'x',
        instructions: '',
      })
    ).toThrow(/instructions/);
  });

  it('coerces missing tools/referenceFiles to empty arrays', () => {
    const m = parseDraftToolInput({
      name: 'sketch',
      version: 1,
      description: 'sketch description',
      instructions: '# sketch\n\n## Output format\n\n```json\n{}\n```',
    });
    expect(m.tools).toEqual([]);
    expect(m.referenceFiles).toEqual([]);
  });
});
