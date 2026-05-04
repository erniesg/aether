import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeCommandProviderId,
  readCommandProviderId,
  resolveCommandLlmProvider,
} from '@/lib/providers/llm/registry';

const ENV_KEYS = [
  'AETHER_COMMAND_PROVIDER',
  'AETHER_COMMAND_MODEL',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
] as const;

describe('command LLM registry', () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('normalizes Claude/OpenAI/DeepSeek provider ids', () => {
    expect(normalizeCommandProviderId('claude')).toBe('anthropic');
    expect(normalizeCommandProviderId('anthropic')).toBe('anthropic');
    expect(normalizeCommandProviderId('openai')).toBe('openai');
    expect(normalizeCommandProviderId('deepseek')).toBe('deepseek');
    expect(normalizeCommandProviderId('unknown')).toBeUndefined();
  });

  it('reads explicit provider selection from env', () => {
    expect(readCommandProviderId({ AETHER_COMMAND_PROVIDER: 'claude' })).toBe('anthropic');
    expect(readCommandProviderId({ AETHER_COMMAND_PROVIDER: 'openai' })).toBe('openai');
  });

  it('auto-selects an available provider only from configured keys', () => {
    process.env.OPENAI_API_KEY = 'openai-test';
    expect(resolveCommandLlmProvider().id).toBe('openai');

    process.env.DEEPSEEK_API_KEY = 'deepseek-test';
    expect(resolveCommandLlmProvider().id).toBe('deepseek');
  });

  it('does not leak a shared model override into an auto-selected fallback provider', async () => {
    process.env.AETHER_COMMAND_MODEL = 'deepseek-v4-flash';
    process.env.OPENAI_API_KEY = 'openai-test';
    const provider = resolveCommandLlmProvider();

    expect(provider.id).toBe('openai');
    expect(provider.listModels()).toContain('gpt-4.1-mini');
  });
});
