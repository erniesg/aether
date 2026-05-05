import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_COMMAND_MODELS,
  createAnthropicCommandProvider,
} from '@/lib/providers/llm/anthropic';

describe('Anthropic command provider', () => {
  it('exposes selectable Claude command models', () => {
    expect(ANTHROPIC_COMMAND_MODELS).toEqual([
      'claude-opus-4-7',
      'claude-sonnet-4-5',
    ]);
  });

  it('translates neutral tool definitions into Claude tool_use blocks', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Searching first.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'search_signals',
          input: { seedText: 'tea' },
        },
      ],
    });
    const client = { messages: { create } } as unknown as Anthropic;
    const provider = createAnthropicCommandProvider({
      apiKey: 'anthropic-test',
      client,
    });

    const result = await provider.completeToolCall!({
      system: 'use tools',
      messages: [{ role: 'user', content: 'find tea refs' }],
      tools: [
        {
          name: 'search_signals',
          description: 'Search references',
          inputSchema: { type: 'object', properties: { seedText: { type: 'string' } } },
        },
      ],
      model: 'claude-opus-4-7',
    });

    const call = create.mock.calls[0][0];
    expect(call).not.toHaveProperty('temperature');
    expect(call.tools).toEqual([
      {
        name: 'search_signals',
        description: 'Search references',
        input_schema: { type: 'object', properties: { seedText: { type: 'string' } } },
      },
    ]);
    expect(call.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'find tea refs' }],
    });
    expect(result).toMatchObject({
      text: 'Searching first.',
      stopReason: 'tool_use',
      provider: { id: 'anthropic', model: 'claude-opus-4-7' },
      toolCalls: [{ id: 'toolu_1', name: 'search_signals', input: { seedText: 'tea' } }],
    });
  });

  it('omits temperature for Claude Opus 4.7 JSON completions', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    const client = { messages: { create } } as unknown as Anthropic;
    const provider = createAnthropicCommandProvider({
      apiKey: 'anthropic-test',
      client,
    });

    const result = await provider.completeJson<{ ok: boolean }>({
      system: 'json only',
      user: 'return ok',
      model: 'claude-opus-4-7',
      temperature: 0,
    });

    const call = create.mock.calls[0][0];
    expect(call).not.toHaveProperty('temperature');
    expect(result.json).toEqual({ ok: true });
  });

  it('keeps temperature for Claude models that support it', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    const client = { messages: { create } } as unknown as Anthropic;
    const provider = createAnthropicCommandProvider({
      apiKey: 'anthropic-test',
      client,
    });

    await provider.completeJson({
      system: 'json only',
      user: 'return ok',
      model: 'claude-sonnet-4-5',
      temperature: 0.2,
    });

    const call = create.mock.calls[0][0];
    expect(call.temperature).toBe(0.2);
  });

  it('groups generic tool results back into Claude user tool_result content', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'done' }],
    });
    const client = { messages: { create } } as unknown as Anthropic;
    const provider = createAnthropicCommandProvider({
      apiKey: 'anthropic-test',
      client,
    });

    await provider.completeToolCall!({
      system: 'use tools',
      messages: [
        { role: 'user', content: 'find tea refs' },
        {
          role: 'assistant',
          toolCalls: [{ id: 'toolu_1', name: 'search_signals', input: { seedText: 'tea' } }],
        },
        {
          role: 'tool',
          toolCallId: 'toolu_1',
          name: 'search_signals',
          content: '{"ok":true}',
        },
      ],
      tools: [
        {
          name: 'search_signals',
          inputSchema: { type: 'object' },
        },
      ],
    });

    const call = create.mock.calls[0][0];
    expect(call.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: '{"ok":true}',
        },
      ],
    });
  });
});
