import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const AnthropicCtor = vi.fn(() => ({
    messages: { create: messagesCreate },
  }));
  const providerGenerate = vi.fn();
  const fakeProvider = {
    id: 'openai',
    displayName: 'OpenAI Images',
    isAvailable: () => true,
    listModels: () => ['gpt-image-1'],
    generate: providerGenerate,
  };
  const resolveProvider = vi.fn(() => fakeProvider);
  return {
    messagesCreate,
    AnthropicCtor,
    providerGenerate,
    fakeProvider,
    resolveProvider,
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mocks.AnthropicCtor,
}));

vi.mock('@/lib/providers/image/registry', () => ({
  resolveProvider: (id?: string) => mocks.resolveProvider(id),
  listAvailableProviders: () => [],
  KNOWN_PROVIDER_IDS: ['openai'],
}));

import { runGenerate, CLAUDE_MODEL } from './generate';

const FAKE_IMAGE_RESULT = {
  provider: 'openai',
  model: 'gpt-image-1',
  images: [
    {
      url: 'https://example.com/out.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    },
  ],
  latencyMs: 12,
  raw: {},
};

describe('agent · runGenerate', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mocks.messagesCreate.mockReset();
    mocks.AnthropicCtor.mockClear();
    mocks.providerGenerate.mockReset();
    mocks.providerGenerate.mockResolvedValue(FAKE_IMAGE_RESULT);
    mocks.resolveProvider.mockClear();
    mocks.resolveProvider.mockReturnValue(mocks.fakeProvider);
    process.env.ANTHROPIC_API_KEY = 'ant_test';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('plans via Claude tool-use, forwards rewrittenPrompt + aspectRatio to provider', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_1',
          input: {
            prompt: 'a wide cinematic desert at dusk',
            aspectRatio: '16:9',
            rationale: 'Wide scene benefits from a 16:9 frame.',
            seed: 42,
          },
        },
      ],
    });

    const outcome = await runGenerate({ prompt: 'dusty canyon banner' });

    expect(mocks.AnthropicCtor).toHaveBeenCalledWith({ apiKey: 'ant_test' });
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);

    const call = mocks.messagesCreate.mock.calls[0]![0];
    expect(call.model).toBe(CLAUDE_MODEL);
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'generate_image' });
    expect(Array.isArray(call.tools)).toBe(true);
    const tool = call.tools.find((t: { name: string }) => t.name === 'generate_image');
    expect(tool).toBeDefined();
    expect(tool.input_schema.required).toEqual(['prompt', 'aspectRatio']);

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    const [req, opts] = mocks.providerGenerate.mock.calls[0]!;
    expect(req.prompt).toBe('a wide cinematic desert at dusk');
    expect(req.aspectRatio).toBe('16:9');
    expect(req.seed).toBe(42);
    expect(opts.model).toBe('gpt-image-1');

    expect(outcome.plan).toEqual({
      rewrittenPrompt: 'a wide cinematic desert at dusk',
      aspectRatio: '16:9',
      rationale: 'Wide scene benefits from a 16:9 frame.',
      seed: 42,
    });
    expect(outcome.provider).toEqual({
      id: 'openai',
      displayName: 'OpenAI Images',
      model: 'gpt-image-1',
    });
    expect(outcome.result).toBe(FAKE_IMAGE_RESULT);
  });

  it('bypassAgent: true skips Anthropic and pipes the prompt straight through', async () => {
    const outcome = await runGenerate({
      prompt: 'raw prompt',
      bypassAgent: true,
    });

    expect(mocks.AnthropicCtor).not.toHaveBeenCalled();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    const [req] = mocks.providerGenerate.mock.calls[0]!;
    expect(req.prompt).toBe('raw prompt');
    expect(req.aspectRatio).toBe('1:1');

    expect(outcome.plan).toEqual({
      rewrittenPrompt: 'raw prompt',
      aspectRatio: '1:1',
    });
  });

  it('throws a helpful error when Claude returns no tool_use block', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'sorry, I refuse to plan.' }],
    });
    await expect(runGenerate({ prompt: 'x' })).rejects.toThrow(
      /did not emit a generate_image tool call/
    );
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
  });

  it('throws when ANTHROPIC_API_KEY is missing and agent is not bypassed', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(runGenerate({ prompt: 'x' })).rejects.toThrow(
      /ANTHROPIC_API_KEY not set/
    );
    expect(mocks.AnthropicCtor).not.toHaveBeenCalled();
  });

  it('respects an explicit providerId by passing it to resolveProvider', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_2',
          input: { prompt: 'foo', aspectRatio: '1:1' },
        },
      ],
    });
    await runGenerate({ prompt: 'foo', providerId: 'gemini' });
    expect(mocks.resolveProvider).toHaveBeenCalledWith('gemini');
  });

  it('uses an explicit model override instead of the provider default', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_3',
          input: { prompt: 'bar', aspectRatio: '1:1' },
        },
      ],
    });
    await runGenerate({ prompt: 'bar', model: 'dall-e-3' });
    const [, opts] = mocks.providerGenerate.mock.calls[0]!;
    expect(opts.model).toBe('dall-e-3');
  });

  it('rejects a tool response with invalid aspectRatio', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_4',
          input: { prompt: 'p', aspectRatio: '21:9' },
        },
      ],
    });
    await expect(runGenerate({ prompt: 'p' })).rejects.toThrow(/aspectRatio/);
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
  });

  it('rejects a tool response missing prompt', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_5',
          input: { aspectRatio: '1:1' },
        },
      ],
    });
    await expect(runGenerate({ prompt: 'p' })).rejects.toThrow(/prompt/);
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
  });

  it('sends a cached system prompt block to Claude', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_image',
          id: 'tu_6',
          input: { prompt: 'k', aspectRatio: '1:1' },
        },
      ],
    });
    await runGenerate({ prompt: 'k' });
    const call = mocks.messagesCreate.mock.calls[0]![0];
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].type).toBe('text');
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.system[0].text.length).toBeGreaterThan(20);
  });
});
