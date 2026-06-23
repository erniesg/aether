import { afterEach, describe, expect, it } from 'vitest';
import {
  CodeChangeProviderUnavailableError,
  listCodeChangeProviders,
  registerCodeChangeProvider,
  resolveCodeChangeProvider,
} from './registry';
import type { CodeChangeProvider } from './types';

function createProvider(id: string, available = true): CodeChangeProvider {
  return {
    id,
    displayName: `${id} code change`,
    available: () => available,
    ingest: async () => ({
      providerId: id,
      title: 'Add repo video drafts',
      files: [],
      hunks: [],
      commits: [],
      reviews: [],
      ci: [],
      provenance: [{ kind: 'provider', ref: id }],
    }),
  };
}

describe('code-change provider registry', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) {
      unregister.pop()?.();
    }
  });

  it('throws a typed unavailable error when no code-change provider is configured', () => {
    expect(() => resolveCodeChangeProvider()).toThrow(CodeChangeProviderUnavailableError);
  });

  it('throws a typed unavailable error for an unknown preferred provider', () => {
    expect(() => resolveCodeChangeProvider('missing-provider')).toThrow(/missing-provider/);
  });

  it('resolves the first available registered provider', () => {
    unregister.push(registerCodeChangeProvider('github', () => createProvider('github')));

    expect(resolveCodeChangeProvider().id).toBe('github');
  });

  it('reports registered provider availability without selecting unavailable providers', () => {
    unregister.push(registerCodeChangeProvider('github', () => createProvider('github')));
    unregister.push(
      registerCodeChangeProvider('local-diff', () => createProvider('local-diff', false))
    );

    expect(listCodeChangeProviders()).toEqual([
      { id: 'github', displayName: 'github code change', available: true },
      { id: 'local-diff', displayName: 'local-diff code change', available: false },
    ]);
    expect(() => resolveCodeChangeProvider('local-diff')).toThrow(/local-diff is not configured/);
  });
});
