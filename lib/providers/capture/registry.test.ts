import { afterEach, describe, expect, it } from 'vitest';
import {
  CaptureProviderUnavailableError,
  listCaptureProviders,
  registerCaptureProvider,
  resolveCaptureProvider,
} from './registry';
import type { CaptureProvider } from './types';

function createProvider(
  id: string,
  available = true
): CaptureProvider {
  return {
    id,
    displayName: `${id} capture`,
    available: () => available,
    capture: async () => ({
      providerId: id,
      artifacts: [],
      provenance: [{ kind: 'provider', ref: id }],
    }),
  };
}

describe('capture provider registry', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) {
      unregister.pop()?.();
    }
  });

  it('throws a typed unavailable error when no capture provider is configured', () => {
    expect(() => resolveCaptureProvider()).toThrow(CaptureProviderUnavailableError);
  });

  it('throws a typed unavailable error for an unknown preferred provider', () => {
    expect(() => resolveCaptureProvider('missing-provider')).toThrow(/missing-provider/);
  });

  it('resolves the first available registered provider', () => {
    unregister.push(registerCaptureProvider('browser', () => createProvider('browser')));

    expect(resolveCaptureProvider().id).toBe('browser');
  });

  it('reports registered provider availability', () => {
    unregister.push(registerCaptureProvider('browser', () => createProvider('browser')));
    unregister.push(registerCaptureProvider('desktop', () => createProvider('desktop', false)));

    expect(listCaptureProviders()).toEqual([
      { id: 'browser', displayName: 'browser capture', available: true },
      { id: 'desktop', displayName: 'desktop capture', available: false },
    ]);
    expect(() => resolveCaptureProvider('desktop')).toThrow(/desktop is not configured/);
  });
});
