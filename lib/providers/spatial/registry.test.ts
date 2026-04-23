import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_SPATIAL_PROVIDER_IDS,
  listSpatialProviders,
  resolveSpatialProvider,
} from './registry';
import { SpatialUnavailableError } from './types';

const SPATIAL_ENV_KEYS = [
  'REPLICATE_API_TOKEN',
  'SPATIAL_MODAL_URL',
  'SPATIAL_MODAL_TOKEN',
  'SPATIAL_PROVIDER',
] as const;

describe('spatial provider registry', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of SPATIAL_ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SPATIAL_ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it('exposes both known spatial provider ids', () => {
    expect(new Set(KNOWN_SPATIAL_PROVIDER_IDS)).toEqual(
      new Set(['replicate-splat', 'modal-splat'])
    );
  });

  it('throws when no spatial provider is configured', () => {
    expect(() => resolveSpatialProvider()).toThrow(SpatialUnavailableError);
  });

  it('returns the only configured provider', () => {
    process.env.REPLICATE_API_TOKEN = 'r8_only';
    expect(resolveSpatialProvider().id).toBe('replicate-splat');
  });

  it('honours SPATIAL_PROVIDER env default when multiple providers are available', () => {
    process.env.REPLICATE_API_TOKEN = 'r8';
    process.env.SPATIAL_MODAL_URL = 'https://splat.example.com/infer';
    process.env.SPATIAL_PROVIDER = 'modal-splat';
    expect(resolveSpatialProvider().id).toBe('modal-splat');
  });

  it('rejects an explicitly requested unavailable provider instead of silently falling through', () => {
    process.env.REPLICATE_API_TOKEN = 'r8';
    expect(() => resolveSpatialProvider('modal-splat')).toThrow(
      SpatialUnavailableError
    );
  });

  it('lists both known providers with availability metadata', () => {
    process.env.SPATIAL_MODAL_URL = 'https://splat.example.com/infer';

    expect(listSpatialProviders()).toEqual([
      {
        id: 'replicate-splat',
        displayName: 'Splatter-Image via Replicate',
        models: ['jd7h/splatter-image'],
        supportsImageToSplat: true,
        supportsTextPrompt: false,
        available: false,
        unavailableReason: 'Replicate splat provider is not connected',
      },
      {
        id: 'modal-splat',
        displayName: 'Splat via Modal',
        models: ['splat-v1'],
        supportsImageToSplat: true,
        supportsTextPrompt: true,
        available: true,
        unavailableReason: undefined,
      },
    ]);
  });
});
