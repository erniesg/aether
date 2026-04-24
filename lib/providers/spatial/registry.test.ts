import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSpatialProviders, resolveSpatialProvider } from './registry';
import { SpatialUnavailableError } from './types';

const ENV_KEYS = [
  'SPATIAL_PROVIDER',
  'REPLICATE_API_TOKEN',
  'SPATIAL_REPLICATE_VERSION',
  'SPATIAL_MODAL_URL',
  'SPATIAL_MODAL_TOKEN',
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(snap: EnvSnapshot) {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key];
  }
}

describe('spatial provider registry', () => {
  let env: EnvSnapshot;

  beforeEach(() => {
    env = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    restoreEnv(env);
  });

  it('lists all three providers with availability reflecting env', () => {
    const providers = listSpatialProviders();
    expect(providers.map((p) => p.id)).toEqual(['draft', 'replicate-splat', 'modal-splat']);

    const draft = providers.find((p) => p.id === 'draft');
    const replicate = providers.find((p) => p.id === 'replicate-splat');
    const modal = providers.find((p) => p.id === 'modal-splat');

    expect(draft?.available).toBe(true);
    expect(replicate?.available).toBe(false);
    expect(replicate?.unavailableReason).toMatch(/not connected/i);
    expect(modal?.available).toBe(false);
    expect(modal?.supportsImageToSplat).toBe(true);
  });

  it('falls back to draft when no real provider is connected', () => {
    expect(resolveSpatialProvider().id).toBe('draft');
  });

  it('prefers a real provider over draft when it is connected', () => {
    process.env.REPLICATE_API_TOKEN = 'sk-test';
    expect(resolveSpatialProvider().id).toBe('replicate-splat');
  });

  it('honours SPATIAL_PROVIDER env override when available', () => {
    process.env.REPLICATE_API_TOKEN = 'sk-test';
    process.env.SPATIAL_MODAL_URL = 'https://modal.example';
    process.env.SPATIAL_PROVIDER = 'modal-splat';
    expect(resolveSpatialProvider().id).toBe('modal-splat');
  });

  it('throws with the canonical unavailable error when a missing provider is requested explicitly', () => {
    expect(() => resolveSpatialProvider('replicate-splat')).toThrowError(SpatialUnavailableError);
  });

  it('rejects unknown provider ids', () => {
    expect(() => resolveSpatialProvider('nonsense-splat')).toThrowError(/unknown spatial provider/);
  });
});
