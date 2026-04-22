import { describe, expect, it } from 'vitest';
import {
  buildProposalMessages,
  parseProposalToolInput,
  PROPOSAL_SYSTEM_PROMPT,
  PROPOSAL_TOOL,
} from '@/lib/agent/proposeCapability';
import type { CapabilityRunRecord } from '@/lib/store/runs';

const baseRun: CapabilityRunRecord = {
  id: 'run_abc',
  tool: 'image-gen',
  provider: 'gemini',
  model: 'gemini-2.5-flash-image',
  prompt: 'recolor to brand palette #0b3d2e #f2e9dc',
  rewrittenPrompt: 'a still life photograph recolored to a muted brand palette',
  rationale: 'brand palette was pinned so the rewrite anchors to those tones',
  aspectRatio: '1:1',
  imageUrl: 'https://cdn.test/out.png',
  status: 'ok',
  step: 'done',
  startedAt: 1,
  finishedAt: 2,
  latencyMs: 1,
};

describe('capability proposal prompt builder', () => {
  it('exports a cacheable system prompt with product framing', () => {
    expect(PROPOSAL_SYSTEM_PROMPT).toMatch(/capability/i);
    expect(PROPOSAL_SYSTEM_PROMPT).toMatch(/aether/i);
    // The system prompt is the cache-hot part, so it must not include
    // per-turn run data.
    expect(PROPOSAL_SYSTEM_PROMPT).not.toContain(baseRun.prompt);
    expect(PROPOSAL_SYSTEM_PROMPT).not.toContain('run_abc');
  });

  it('declares a propose_capability tool with the required fields', () => {
    expect(PROPOSAL_TOOL.name).toBe('propose_capability');
    const schema = PROPOSAL_TOOL.input_schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.trigger).toBeDefined();
    expect(schema.properties.paramSchema).toBeDefined();
    expect(schema.required).toEqual(expect.arrayContaining(['name', 'trigger', 'paramSchema']));
  });

  it('builds user messages that carry the run record payload only', () => {
    const messages = buildProposalMessages(baseRun);
    expect(messages).toHaveLength(1);
    const first = messages[0];
    expect(first.role).toBe('user');
    const text = typeof first.content === 'string'
      ? first.content
      : first.content.map((b) => ('text' in b ? b.text : '')).join('\n');
    expect(text).toContain(baseRun.prompt);
    expect(text).toContain(baseRun.tool);
    expect(text).toContain(baseRun.provider);
  });

  it('parses a well-formed tool call payload', () => {
    const parsed = parseProposalToolInput({
      name: 'recolor to brand palette',
      trigger: 'recolor the selected layer using the pinned brand palette',
      paramSchema: {
        type: 'object',
        properties: { layerId: { type: 'string' } },
        required: ['layerId'],
      },
      notes: 'anchors to pinned brand tokens',
    });
    expect(parsed.name).toBe('recolor to brand palette');
    expect(parsed.trigger).toMatch(/recolor/);
    expect(parsed.paramSchema).toMatchObject({ type: 'object' });
    expect(parsed.notes).toMatch(/brand/);
  });

  it('rejects missing required fields', () => {
    expect(() => parseProposalToolInput({ trigger: 'x', paramSchema: {} })).toThrow(/name/);
    expect(() => parseProposalToolInput({ name: 'x', paramSchema: {} })).toThrow(/trigger/);
    expect(() => parseProposalToolInput({ name: 'x', trigger: 'y' })).toThrow(/paramSchema/);
  });
});
