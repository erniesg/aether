import { describe, expect, it, vi } from 'vitest';
import {
  DEEPSEEK_V4_MODELS,
  createDeepSeekProvider,
} from '@/lib/providers/llm/deepseek';

describe('DeepSeek command provider', () => {
  it('exposes current DeepSeek V4 API model ids as selectable options', () => {
    expect(DEEPSEEK_V4_MODELS).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });

  it('uses the configured model and OpenAI-compatible chat completions shape', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer ds-test',
        'Content-Type': 'application/json',
      });
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.model).toBe('deepseek-v4-pro');
      expect(body.messages).toEqual([
        { role: 'system', content: 'return json' },
        { role: 'user', content: 'generate socials for tea' },
      ]);
      expect(body.stream).toBe(false);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"action":"generate-socials","brief":"tea"}',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const provider = createDeepSeekProvider({
      apiKey: 'ds-test',
      fetchImpl,
    });
    const result = await provider.completeJson({
      system: 'return json',
      user: 'generate socials for tea',
      model: 'deepseek-v4-pro',
    });

    expect(result).toMatchObject({
      json: { action: 'generate-socials', brief: 'tea' },
      provider: { id: 'deepseek', model: 'deepseek-v4-pro' },
    });
  });

  it('translates neutral tool definitions into DeepSeek function calls', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'search_signals',
            description: 'Search references',
            parameters: { type: 'object', properties: { seedText: { type: 'string' } } },
          },
        },
      ]);
      expect(body.tool_choice).toBe('auto');
      expect(body.messages).toEqual([
        { role: 'system', content: 'use tools' },
        { role: 'user', content: 'find tea references' },
      ]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                reasoning_content: 'I should search for references first.',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'search_signals',
                      arguments: '{"seedText":"tea"}',
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

    const provider = createDeepSeekProvider({
      apiKey: 'ds-test',
      fetchImpl,
    });
    const result = await provider.completeToolCall!({
      system: 'use tools',
      messages: [{ role: 'user', content: 'find tea references' }],
      tools: [
        {
          name: 'search_signals',
          description: 'Search references',
          inputSchema: { type: 'object', properties: { seedText: { type: 'string' } } },
        },
      ],
      model: 'deepseek-v4-flash',
    });

    expect(result).toMatchObject({
      stopReason: 'tool_calls',
      reasoningContent: 'I should search for references first.',
      provider: { id: 'deepseek', model: 'deepseek-v4-flash' },
      toolCalls: [{ id: 'call_1', name: 'search_signals', input: { seedText: 'tea' } }],
    });
  });

  it('passes DeepSeek reasoning_content back on tool-call continuation turns', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.messages).toEqual([
        { role: 'system', content: 'use tools' },
        { role: 'user', content: 'what time is it' },
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'Need the current date.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_current_datetime',
                arguments: '{"timezone":"Asia/Singapore"}',
              },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"nowLocal":"2026-05-04T23:00:00"}' },
      ]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: 'It is 2026-05-04T23:00:00 in Singapore.' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const provider = createDeepSeekProvider({
      apiKey: 'ds-test',
      fetchImpl,
    });

    const result = await provider.completeToolCall!({
      system: 'use tools',
      messages: [
        { role: 'user', content: 'what time is it' },
        {
          role: 'assistant',
          reasoningContent: 'Need the current date.',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_current_datetime',
              input: { timezone: 'Asia/Singapore' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          name: 'get_current_datetime',
          content: '{"nowLocal":"2026-05-04T23:00:00"}',
        },
      ],
      tools: [
        {
          name: 'get_current_datetime',
          inputSchema: { type: 'object' },
        },
      ],
      model: 'deepseek-v4-flash',
    });

    expect(result).toMatchObject({
      text: 'It is 2026-05-04T23:00:00 in Singapore.',
      toolCalls: [],
      stopReason: 'stop',
    });
  });
});
