import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureConfiguredMotionSourceAuthorProviders,
  resetConfiguredMotionSourceAuthorProvidersForTests,
} from '@/lib/providers/source-author/configured';
import { listMotionSourceAuthorProviders } from '@/lib/providers/source-author/registry';

const SOURCE_AUTHOR_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'AETHER_MOTION_SOURCE_AUTHOR_MODEL',
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  SOURCE_AUTHOR_ENV_KEYS.map((key) => [key, process.env[key]])
);

describe('ensureConfiguredMotionSourceAuthorProviders', () => {
  afterEach(() => {
    resetConfiguredMotionSourceAuthorProvidersForTests();
    restoreEnv();
  });

  it('registers the Anthropic source author only when key and model are configured', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.AETHER_MOTION_SOURCE_AUTHOR_MODEL = 'claude-test-source-author';

    ensureConfiguredMotionSourceAuthorProviders();

    expect(listMotionSourceAuthorProviders()).toEqual([
      {
        id: 'anthropic-source-author',
        displayName: 'Anthropic source author',
        available: true,
      },
    ]);
  });

  it('does not register a default model-backed author from an API key alone', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.AETHER_MOTION_SOURCE_AUTHOR_MODEL;

    ensureConfiguredMotionSourceAuthorProviders();

    expect(listMotionSourceAuthorProviders()).toEqual([]);
  });
});

function restoreEnv(): void {
  for (const key of SOURCE_AUTHOR_ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}
