import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_COMMAND_MODELS,
  createOpenAiCommandProvider,
} from '@/lib/providers/llm/openai';

describe('OpenAI command provider', () => {
  it('exposes selectable OpenAI command models', () => {
    expect(OPENAI_COMMAND_MODELS).toEqual(['gpt-4.1-mini', 'gpt-4.1']);
  });

  it('uses Chat Completions JSON mode for structured command parsing', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages).toEqual([
        { role: 'system', content: 'return json' },
        { role: 'user', content: 'generate socials for tea' },
      ]);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"brief":"tea"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const provider = createOpenAiCommandProvider({
      apiKey: 'openai-test',
      fetchImpl,
    });

    const result = await provider.completeJson({
      system: 'return json',
      user: 'generate socials for tea',
      model: 'gpt-4.1-mini',
    });

    expect(result).toMatchObject({
      json: { brief: 'tea' },
      provider: { id: 'openai', model: 'gpt-4.1-mini' },
    });
  });

  it('translates neutral tool definitions into OpenAI function tools', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'generate_image',
            description: 'Render',
            parameters: { type: 'object', properties: { prompt: { type: 'string' } } },
          },
        },
      ]);
      expect(body.tool_choice).toBe('auto');
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'generate_image',
                      arguments: '{"prompt":"tea hero"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const provider = createOpenAiCommandProvider({
      apiKey: 'openai-test',
      fetchImpl,
    });

    const result = await provider.completeToolCall!({
      system: 'use tools',
      messages: [{ role: 'user', content: 'render tea' }],
      tools: [
        {
          name: 'generate_image',
          description: 'Render',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
        },
      ],
      model: 'gpt-4.1-mini',
    });

    expect(result).toMatchObject({
      stopReason: 'tool_calls',
      provider: { id: 'openai', model: 'gpt-4.1-mini' },
      toolCalls: [{ id: 'call_1', name: 'generate_image', input: { prompt: 'tea hero' } }],
    });
  });
});
