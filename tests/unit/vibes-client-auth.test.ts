import { afterEach, describe, expect, it } from 'vitest';
import {
  VIBES_API_KEY_STORAGE,
  readStoredVibesKey,
  vibesAuthHeadersFrom,
  vibesDevHeaders,
  writeStoredVibesKey,
} from '@/lib/research/vibes/client-auth';

describe('vibes client auth helpers', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the Vibes API key through localStorage', () => {
    expect(readStoredVibesKey()).toBe('');
    writeStoredVibesKey('vibes_vk_test123');
    expect(readStoredVibesKey()).toBe('vibes_vk_test123');
    expect(window.localStorage.getItem(VIBES_API_KEY_STORAGE)).toBe('vibes_vk_test123');
  });

  it('clears the stored key when written empty', () => {
    writeStoredVibesKey('vibes_vk_test123');
    writeStoredVibesKey('');
    expect(readStoredVibesKey()).toBe('');
    expect(window.localStorage.getItem(VIBES_API_KEY_STORAGE)).toBeNull();
  });

  it('builds an Authorization header from a key or token, never leaking it in a URL', () => {
    expect(vibesAuthHeadersFrom('vibes_vk_abc')).toEqual({
      Authorization: 'Bearer vibes_vk_abc',
    });
    expect(vibesAuthHeadersFrom('  token  ')).toEqual({ Authorization: 'Bearer token' });
  });

  it('falls back to the local-dev header outside production', () => {
    // vitest runs with NODE_ENV=test, so the dev fallback is active.
    expect(vibesDevHeaders()).toEqual({ 'x-vibes-dev-user': 'aether-local-dev' });
    expect(vibesAuthHeadersFrom(null)).toEqual({ 'x-vibes-dev-user': 'aether-local-dev' });
    expect(vibesAuthHeadersFrom('')).toEqual({ 'x-vibes-dev-user': 'aether-local-dev' });
  });
});
