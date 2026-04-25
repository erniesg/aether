/**
 * callSkill.test.ts — AC2: callSkill tool wiring.
 *
 * Verifies:
 * - System prompt assembly includes the skill instructions.
 * - `cache_control: { type: 'ephemeral' }` is set on the system prompt block.
 * - The runtime returns structured SkillRuntimeOutput.
 * - cacheHitTokens is forwarded when the API reports cache hits.
 */

import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

// We mock the Anthropic SDK so no real API calls are made.
vi.mock('@anthropic-ai/sdk');

import { callSkill } from './callSkill';
import type { SkillRef } from './types';

const FIXTURE_SKILL_DIR = path.resolve(__dirname, '__fixtures__/sample-skill');

function makeSkillRef(overrides?: Partial<SkillRef>): SkillRef {
  return {
    kind: 'skill',
    id: 'sample-skill',
    version: 1,
    manifestPath: path.join(FIXTURE_SKILL_DIR, 'SKILL.md'),
    manifest: {
      name: 'sample-skill',
      version: 1,
      description: 'A minimal fixture skill for loader tests.',
      tools: ['read_file', 'write_file'],
      referenceFiles: ['docs/style-guide.md'],
      instructions: '# Sample Skill\n\nDo things.',
    },
    ...overrides,
  };
}

// The mocked Anthropic class + client
let mockCreate: MockedFunction<(...args: unknown[]) => unknown>;

beforeEach(() => {
  vi.clearAllMocks();

  // Return a minimal messages.create response with cache usage
  mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"ok":true,"result":{"processed":true}}' }],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 0,
    },
  });

  // Wire the mock onto the Anthropic class so `new Anthropic()` works
  const MockedAnthropic = Anthropic as unknown as { prototype: { messages: { create: typeof mockCreate } } };
  MockedAnthropic.prototype = {
    messages: { create: mockCreate },
  };
});

describe('callSkill', () => {
  it('includes skill instructions in the system prompt', async () => {
    const skillRef = makeSkillRef();
    await callSkill({ skillRef, input: { test: true } });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;

    // System must include the skill instructions
    const system = callArg.system;
    const systemStr = Array.isArray(system)
      ? system.map((b) => ('text' in b ? b.text : '')).join('\n')
      : String(system ?? '');
    expect(systemStr).toContain('Sample Skill');
  });

  it('sets cache_control: ephemeral on the skill instructions system block', async () => {
    const skillRef = makeSkillRef();
    await callSkill({ skillRef, input: { test: true } });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const system = callArg.system;

    // Must be an array of content blocks (not a plain string) so cache_control
    // can be attached to the skill instructions block
    expect(Array.isArray(system)).toBe(true);
    const blocks = system as Anthropic.TextBlockParam[];
    const skillBlock = blocks.find((b) => b.text?.includes('Sample Skill'));
    expect(skillBlock).toBeDefined();
    expect(skillBlock?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('returns ok: true and structured result on success', async () => {
    const skillRef = makeSkillRef();
    const output = await callSkill({ skillRef, input: { test: true } });

    expect(output.ok).toBe(true);
    expect(output.result).toEqual({ processed: true });
  });

  it('forwards cacheHitTokens from API usage', async () => {
    const skillRef = makeSkillRef();
    const output = await callSkill({ skillRef, input: { test: true } });

    expect(output.cacheHitTokens).toBe(80);
  });

  it('returns ok: false with error message when API throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'));

    const skillRef = makeSkillRef();
    const output = await callSkill({ skillRef, input: { test: true } });

    expect(output.ok).toBe(false);
    expect(output.error).toContain('API rate limit');
  });

  it('passes input as user message content', async () => {
    const skillRef = makeSkillRef();
    const input = { filePath: 'logo.png', transformation: 'neon-drench' };
    await callSkill({ skillRef, input });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const userMsg = callArg.messages?.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    const userContent = Array.isArray(userMsg!.content)
      ? userMsg!.content.map((b) => ('text' in b ? b.text : '')).join('')
      : String(userMsg!.content);
    expect(userContent).toContain('logo.png');
  });
});
