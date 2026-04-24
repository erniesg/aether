import { afterEach, describe, expect, it } from 'vitest';
import {
  listVideoProviderStatuses,
  resolveVideoProvider,
} from '@/lib/providers/video/registry';
import { VideoProviderUnavailableError } from '@/lib/providers/video/types';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('video provider registry', () => {
  it('lists provider capabilities without requiring credentials', () => {
    delete process.env.REMOTION_RENDER_URL;
    delete process.env.VOLCENGINE_ARK_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.VIDEO_PROVIDER;

    expect(listVideoProviderStatuses()).toEqual([
      expect.objectContaining({
        id: 'hyperframes',
        supportsSceneSpec: true,
        supportsAudioSync: true,
        available: true,
      }),
      expect.objectContaining({
        id: 'remotion',
        supportsSceneSpec: true,
        supportsAudioSync: true,
        available: false,
      }),
      expect.objectContaining({
        id: 'volcengine',
        supportsImageToVideo: true,
        available: false,
      }),
      expect.objectContaining({
        id: 'replicate',
        supportsTextToVideo: true,
        available: false,
      }),
    ]);
  });

  it('keeps hyperframes as the deterministic default when providerId is omitted', () => {
    process.env.REMOTION_RENDER_URL = 'http://localhost:7777/render';
    process.env.REPLICATE_API_TOKEN = 'r8-test';
    delete process.env.VIDEO_PROVIDER;

    expect(resolveVideoProvider().id).toBe('hyperframes');
  });

  it('honors VIDEO_PROVIDER when no per-request provider is supplied', () => {
    process.env.REPLICATE_API_TOKEN = 'r8-test';
    process.env.VIDEO_PROVIDER = 'replicate';

    expect(resolveVideoProvider().id).toBe('replicate');
  });

  it('falls back to the deterministic local provider when VIDEO_PROVIDER is unavailable', () => {
    delete process.env.VOLCENGINE_ARK_API_KEY;
    process.env.VIDEO_PROVIDER = 'volcengine';

    expect(resolveVideoProvider().id).toBe('hyperframes');
  });

  it('fails closed for unavailable or unknown video providers', () => {
    delete process.env.REMOTION_RENDER_URL;
    delete process.env.VIDEO_PROVIDER;

    expect(() => resolveVideoProvider('remotion')).toThrow(
      VideoProviderUnavailableError
    );
    expect(() => resolveVideoProvider('seedance')).toThrow(/unknown video provider/);
  });
});
