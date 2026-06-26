import { afterEach, describe, expect, it } from 'vitest';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
} from './types';
import {
  MotionImageToVideoProviderUnavailableError,
  listMotionImageToVideoProviders,
  registerMotionImageToVideoProvider,
  resolveMotionImageToVideoProvider,
} from './generation-registry';

const request: MotionImageToVideoRequest = {
  id: 'image-to-video-clip-beat-demo-text',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  clipId: 'clip-beat-demo-text',
  sourceAssetId: 'capture-screenshot-aether-localhost',
  source: {
    assetId: 'capture-screenshot-aether-localhost',
    assetUrl: 'asset://capture/aether-home.png',
    kind: 'screenshot',
    mimeType: 'image/png',
    providerId: 'browser-capture',
    width: 1080,
    height: 1920,
  },
  prompt: 'Animate the product screenshot.',
  aspectRatio: '9:16',
  fps: 30,
  durationFrames: 240,
  width: 1080,
  height: 1920,
  output: {
    id: 'generated-clip-beat-demo-text-image-to-video',
    clipId: 'clip-beat-demo-text',
    sourceAssetId: 'capture-screenshot-aether-localhost',
    width: 1080,
    height: 1920,
    mimeType: 'video/mp4',
    path: 'generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
    provenance: [{ kind: 'timeline', ref: 'clip-beat-demo-text' }],
  },
  provenance: [{ kind: 'timeline', ref: 'clip-beat-demo-text' }],
};

function createProvider(id: string, available = true): MotionImageToVideoProvider {
  return {
    id,
    displayName: `${id} image-to-video`,
    available: () => available,
    generate: async () => ({
      providerId: id,
      artifacts: [
        {
          ...request.output,
          requestId: request.id,
          assetUrl: `asset://${id}/generated.mp4`,
          durationMs: 8000,
          provenance: [{ kind: 'provider', ref: id }],
        },
      ],
      provenance: [{ kind: 'provider', ref: id }],
    }),
  };
}

describe('motion image-to-video provider registry', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) {
      unregister.pop()?.();
    }
  });

  it('throws a typed unavailable error when no provider is configured', () => {
    expect(() => resolveMotionImageToVideoProvider()).toThrow(
      MotionImageToVideoProviderUnavailableError
    );
  });

  it('resolves available providers without hardcoding a default model', () => {
    unregister.push(
      registerMotionImageToVideoProvider('runway', () => createProvider('runway'))
    );
    unregister.push(
      registerMotionImageToVideoProvider('pika', () => createProvider('pika'))
    );

    expect(resolveMotionImageToVideoProvider().id).toBe('runway');
    expect(resolveMotionImageToVideoProvider('pika').id).toBe('pika');
  });

  it('reports availability and rejects unavailable preferred providers', () => {
    unregister.push(
      registerMotionImageToVideoProvider('runway', () => createProvider('runway', false))
    );

    expect(listMotionImageToVideoProviders()).toEqual([
      {
        id: 'runway',
        displayName: 'runway image-to-video',
        available: false,
      },
    ]);
    expect(() => resolveMotionImageToVideoProvider('runway')).toThrow(
      /runway is not configured/
    );
  });

  it('keeps generation execution behind the provider contract', async () => {
    unregister.push(
      registerMotionImageToVideoProvider('runway', () => createProvider('runway'))
    );

    await expect(resolveMotionImageToVideoProvider('runway').generate(request)).resolves.toEqual({
      providerId: 'runway',
      artifacts: [
        {
          ...request.output,
          requestId: request.id,
          assetUrl: 'asset://runway/generated.mp4',
          durationMs: 8000,
          provenance: [{ kind: 'provider', ref: 'runway' }],
        },
      ],
      provenance: [{ kind: 'provider', ref: 'runway' }],
    });
  });
});
