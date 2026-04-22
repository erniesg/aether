import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_SEGMENTATION_PROVIDER_IDS,
  listSegmentationProviders,
  resolveSegmentationProvider,
} from './registry';
import { SegmentationUnavailableError } from './types';

const SEGMENTATION_ENV_KEYS = [
  'REPLICATE_API_TOKEN',
  'SAM3_MODAL_URL',
  'SAM3_MODAL_TOKEN',
  'SEGMENTATION_PROVIDER',
] as const;

describe('segmentation provider registry', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of SEGMENTATION_ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SEGMENTATION_ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it('exposes both known segmentation provider ids', () => {
    expect(new Set(KNOWN_SEGMENTATION_PROVIDER_IDS)).toEqual(new Set(['sam3', 'sam2']));
  });

  it('throws when no segmentation provider is configured', () => {
    expect(() => resolveSegmentationProvider()).toThrow(SegmentationUnavailableError);
  });

  it('returns the only configured provider', () => {
    process.env.REPLICATE_API_TOKEN = 'r8_only';
    expect(resolveSegmentationProvider().id).toBe('sam2');
  });

  it('honours SEGMENTATION_PROVIDER env default when multiple providers are available', () => {
    process.env.REPLICATE_API_TOKEN = 'r8';
    process.env.SAM3_MODAL_URL = 'https://sam3.example.com/segment';
    process.env.SEGMENTATION_PROVIDER = 'sam2';
    expect(resolveSegmentationProvider().id).toBe('sam2');
  });

  it('rejects an explicitly requested unavailable provider instead of silently falling through', () => {
    process.env.REPLICATE_API_TOKEN = 'r8';
    expect(() => resolveSegmentationProvider('sam3')).toThrow(SegmentationUnavailableError);
  });

  it('lists both known providers with availability metadata', () => {
    process.env.SAM3_MODAL_URL = 'https://sam3.example.com/segment';

    expect(listSegmentationProviders()).toEqual([
      {
        id: 'sam3',
        displayName: 'SAM 3 via Modal',
        models: ['sam3.1', 'sam3'],
        supportsTextPrompt: true,
        available: true,
        unavailableReason: undefined,
      },
      {
        id: 'sam2',
        displayName: 'SAM 2 via Replicate',
        models: ['meta/sam-2'],
        supportsTextPrompt: false,
        available: false,
        unavailableReason: 'Replicate SAM 2 is not connected',
      },
    ]);
  });
});
