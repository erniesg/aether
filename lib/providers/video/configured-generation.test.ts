import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureConfiguredMotionImageToVideoProviders,
  resetConfiguredMotionImageToVideoProvidersForTests,
} from './configured-generation';
import { listMotionImageToVideoProviders } from './generation-registry';

const IMAGE_TO_VIDEO_ENV_KEYS = [
  'AETHER_IMAGE_TO_VIDEO_PROJECT_DIR',
  'AETHER_IMAGE_TO_VIDEO_COMMAND',
  'AETHER_IMAGE_TO_VIDEO_ARGS',
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  IMAGE_TO_VIDEO_ENV_KEYS.map((key) => [key, process.env[key]])
);

describe('ensureConfiguredMotionImageToVideoProviders', () => {
  afterEach(() => {
    resetConfiguredMotionImageToVideoProvidersForTests();
    restoreEnv();
  });

  it('registers the command image-to-video provider when project directory and command are configured', () => {
    process.env.AETHER_IMAGE_TO_VIDEO_PROJECT_DIR = '/repo';
    process.env.AETHER_IMAGE_TO_VIDEO_COMMAND = 'node';
    process.env.AETHER_IMAGE_TO_VIDEO_ARGS = 'scripts/image-to-video.mjs --quality draft';

    ensureConfiguredMotionImageToVideoProviders();

    expect(listMotionImageToVideoProviders()).toEqual([
      {
        id: 'image-video-command',
        displayName: 'Command image-to-video generation',
        available: true,
      },
    ]);
  });

  it('does not register a default image-to-video provider from a command alone', () => {
    delete process.env.AETHER_IMAGE_TO_VIDEO_PROJECT_DIR;
    process.env.AETHER_IMAGE_TO_VIDEO_COMMAND = 'node';

    ensureConfiguredMotionImageToVideoProviders();

    expect(listMotionImageToVideoProviders()).toEqual([]);
  });
});

function restoreEnv(): void {
  for (const key of IMAGE_TO_VIDEO_ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}
