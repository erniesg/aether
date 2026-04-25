/**
 * callSkill.test.ts — AC2: callSkill tool wiring.
 *
 * Verifies:
 * - System prompt assembly includes the skill instructions.
 * - `cache_control: { type: 'ephemeral' }` is set on the system prompt block.
 * - The runtime returns structured SkillRuntimeOutput.
 * - cacheHitTokens is forwarded when the API reports cache hits.
 * - toolRegistry wiring: empty tools (no tools param), populated tools (wired), missing tool throws.
 * - referenceFiles: file contents are prepended to the system prompt.
 * - manifestPath loading: manifest loaded from disk when path is resolvable.
 */

import { describe, expect, it, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';

// We mock the Anthropic SDK so no real API calls are made.
vi.mock('@anthropic-ai/sdk');

import { callSkill } from './callSkill';
import type { SkillRef } from './types';

/**
 * Build a SkillRef that does NOT set a manifestPath so callSkill falls back
 * to the in-memory manifest snapshot (no filesystem reads, keeps tests fast).
 * Override `manifestPath` when you want to test the disk-load path.
 */
function makeSkillRef(overrides?: Partial<SkillRef>): SkillRef {
  return {
    kind: 'skill',
    id: 'sample-skill',
    version: 1,
    // Empty string → callSkill skips disk load and uses the snapshot
    manifestPath: '',
    manifest: {
      name: 'sample-skill',
      version: 1,
      description: 'A minimal fixture skill for loader tests.',
      tools: [],
      referenceFiles: [],
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

  // -----------------------------------------------------------------------
  // Blocker 3 — toolRegistry wiring
  // -----------------------------------------------------------------------

  it('does NOT include tools param when manifest.tools is empty', async () => {
    const skillRef = makeSkillRef(); // tools: []
    await callSkill({ skillRef, input: { test: true } });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(callArg.tools).toBeUndefined();
  });

  it('passes resolved tools to messages.create when manifest.tools is non-empty', async () => {
    const READ_FILE_TOOL: Anthropic.Tool = {
      name: 'read_file',
      description: 'Read a file from disk.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    };
    const WRITE_FILE_TOOL: Anthropic.Tool = {
      name: 'write_file',
      description: 'Write a file to disk.',
      input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    };

    const skillRef = makeSkillRef({
      manifest: {
        name: 'sample-skill',
        version: 1,
        description: 'A minimal fixture skill for loader tests.',
        tools: ['read_file', 'write_file'],
        referenceFiles: [],
        instructions: '# Sample Skill\n\nDo things.',
      },
    });

    await callSkill({
      skillRef,
      input: { test: true },
      toolRegistry: { read_file: READ_FILE_TOOL, write_file: WRITE_FILE_TOOL },
    });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(Array.isArray(callArg.tools)).toBe(true);
    expect(callArg.tools).toHaveLength(2);
    const toolNames = (callArg.tools as Anthropic.Tool[]).map((t) => t.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
  });

  it('throws when manifest.tools is non-empty but a tool is missing from registry', async () => {
    const skillRef = makeSkillRef({
      manifest: {
        name: 'sample-skill',
        version: 1,
        description: 'A minimal fixture skill for loader tests.',
        tools: ['read_file', 'missing_tool'],
        referenceFiles: [],
        instructions: '# Sample Skill\n\nDo things.',
      },
    });

    // Only read_file registered — missing_tool is absent
    const READ_FILE_TOOL: Anthropic.Tool = {
      name: 'read_file',
      description: 'Read a file.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    };

    await expect(
      callSkill({ skillRef, input: { test: true }, toolRegistry: { read_file: READ_FILE_TOOL } })
    ).rejects.toThrow(/missing_tool/i);

    // API was never called
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Blocker 4 — referenceFiles loading
  // -----------------------------------------------------------------------

  it('prepends reference file contents to the system prompt', async () => {
    // Create a temp skill dir with a reference file
    const tmpDir = path.join(
      '/tmp',
      `callskill-test-reffiles-${Date.now()}`
    );
    await fs.mkdir(tmpDir, { recursive: true });
    // Write a minimal SKILL.md so the loader can parse it if needed
    await fs.writeFile(
      path.join(tmpDir, 'SKILL.md'),
      `---\nname: ref-test\nversion: 1\ndescription: ref test\nreferenceFiles:\n  - notes.md\n---\n\n# Instructions`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(tmpDir, 'notes.md'),
      '# Style Guide\n\nUse warm tones only.',
      'utf-8'
    );

    const skillRef = makeSkillRef({
      manifestPath: path.join(tmpDir, 'SKILL.md'),
      manifest: {
        name: 'ref-test',
        version: 1,
        description: 'ref test',
        tools: [],
        referenceFiles: ['notes.md'],
        instructions: '# Instructions',
      },
    });

    await callSkill({ skillRef, input: { test: true } });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const system = callArg.system as Anthropic.TextBlockParam[];
    const systemText = system.map((b) => b.text).join('\n');
    expect(systemText).toContain('Style Guide');
    expect(systemText).toContain('Use warm tones only.');

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('skips missing reference files with a warning instead of throwing', async () => {
    // Spy on console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tmpDir = path.join('/tmp', `callskill-test-missing-ref-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'SKILL.md'),
      `---\nname: missing-ref-test\nversion: 1\ndescription: missing ref\nreferenceFiles:\n  - does-not-exist.md\n---\n\n# Instructions`,
      'utf-8'
    );

    const skillRef = makeSkillRef({
      manifestPath: path.join(tmpDir, 'SKILL.md'),
      manifest: {
        name: 'missing-ref-test',
        version: 1,
        description: 'missing ref',
        tools: [],
        referenceFiles: ['does-not-exist.md'],
        instructions: '# Instructions',
      },
    });

    // Should NOT throw
    const output = await callSkill({ skillRef, input: { test: true } });
    expect(output.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does-not-exist.md'));

    warnSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Blocker 5 — manifestPath loading
  // -----------------------------------------------------------------------

  it('loads manifest fresh from disk when manifestPath is set', async () => {
    const tmpDir = path.join('/tmp', `callskill-test-diskload-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    // Write a SKILL.md with a DIFFERENT description than the in-memory snapshot
    await fs.writeFile(
      path.join(tmpDir, 'SKILL.md'),
      `---\nname: disk-skill\nversion: 2\ndescription: From disk\n---\n\n# Disk Instructions`,
      'utf-8'
    );

    const skillRef = makeSkillRef({
      manifestPath: path.join(tmpDir, 'SKILL.md'),
      manifest: {
        name: 'in-memory-skill',
        version: 1,
        description: 'In-memory snapshot — should be overridden by disk load',
        tools: [],
        referenceFiles: [],
        instructions: '# In-Memory Instructions',
      },
    });

    await callSkill({ skillRef, input: { test: true } });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const system = callArg.system as Anthropic.TextBlockParam[];
    const systemText = system.map((b) => b.text).join('\n');

    // Disk version's description and instructions should appear, NOT the snapshot's
    expect(systemText).toContain('From disk');
    expect(systemText).toContain('Disk Instructions');
    expect(systemText).not.toContain('In-Memory Instructions');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('falls back to the in-memory manifest snapshot when manifestPath is empty', async () => {
    // No manifestPath → snapshot is used
    const skillRef = makeSkillRef({
      manifestPath: '',
      manifest: {
        name: 'snapshot-skill',
        version: 1,
        description: 'Snapshot only',
        tools: [],
        referenceFiles: [],
        instructions: '# Snapshot Instructions',
      },
    });

    await callSkill({ skillRef, input: { test: true } });

    const callArg = mockCreate.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const system = callArg.system as Anthropic.TextBlockParam[];
    const systemText = system.map((b) => b.text).join('\n');
    expect(systemText).toContain('Snapshot Instructions');
  });
});
