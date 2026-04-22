import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_PROVIDER_IDS,
  listAvailableProviders,
  resolveProvider,
} from './registry';
import { ProviderUnavailableError } from './types';

const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'REPLICATE_API_TOKEN',
  'VOLCENGINE_ARK_API_KEY',
  'IMAGE_GEN_PROVIDER',
] as const;

describe('image provider registry', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of PROVIDER_ENV_KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of PROVIDER_ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('exposes all four known provider ids', () => {
    expect(new Set(KNOWN_PROVIDER_IDS)).toEqual(
      new Set(['openai', 'gemini', 'replicate', 'volcengine'])
    );
  });

  it('throws ProviderUnavailableError when no provider has credentials', () => {
    expect(() => resolveProvider()).toThrow(ProviderUnavailableError);
  });

  it('returns the provider matching the only configured key', () => {
    process.env.OPENAI_API_KEY = 'sk-only-openai';
    const provider = resolveProvider();
    expect(provider.id).toBe('openai');
    expect(provider.isAvailable()).toBe(true);
  });

  it('honours IMAGE_GEN_PROVIDER env default over registry iteration order', () => {
    process.env.OPENAI_API_KEY = 'sk';
    process.env.GOOGLE_GEMINI_API_KEY = 'gk';
    process.env.VOLCENGINE_ARK_API_KEY = 'ak';
    process.env.IMAGE_GEN_PROVIDER = 'volcengine';
    expect(resolveProvider().id).toBe('volcengine');
  });

  it('explicit ?provider= override beats the env default', () => {
    process.env.OPENAI_API_KEY = 'sk';
    process.env.GOOGLE_GEMINI_API_KEY = 'gk';
    process.env.IMAGE_GEN_PROVIDER = 'openai';
    expect(resolveProvider('gemini').id).toBe('gemini');
  });

  it('falls through an unavailable preferred id to the next available provider', () => {
    // Prefer openai, but only gemini has a key — should fall through.
    process.env.GOOGLE_GEMINI_API_KEY = 'gk';
    expect(resolveProvider('openai').id).toBe('gemini');
  });

  it('listAvailableProviders reflects current env state', () => {
    process.env.OPENAI_API_KEY = 'sk';
    process.env.VOLCENGINE_ARK_API_KEY = 'ak';
    const ids = listAvailableProviders().map((p) => p.id).sort();
    expect(ids).toEqual(['openai', 'volcengine']);
    for (const p of listAvailableProviders()) {
      expect(p.displayName).toBeTruthy();
      expect(Array.isArray(p.models)).toBe(true);
      expect(p.models.length).toBeGreaterThan(0);
    }
  });

  it('listAvailableProviders returns empty array when no keys are set', () => {
    expect(listAvailableProviders()).toEqual([]);
  });
});
