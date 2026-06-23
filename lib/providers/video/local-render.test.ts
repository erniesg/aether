import { describe, expect, it, vi } from 'vitest';
import {
  createHyperFramesRenderProvider,
  createRemotionRenderProvider,
  createRunnerMotionRenderProvider,
  type MotionRenderRunnerResult,
} from './local-render';
import type { MotionRenderRequest } from './types';

const renderRequest: MotionRenderRequest = {
  id: 'render-plan-motion-aether-launch-draft-primary-remotion',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  engine: 'remotion',
  compositionId: 'motion-aether-launch-draft-primary',
  fps: 30,
  durationFrames: 900,
  tracks: [],
  outputs: [
    {
      id: 'render-export-x-9x16-video',
      exportId: 'export-x-9x16',
      kind: 'video',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
      path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
    {
      id: 'render-export-x-9x16-poster',
      exportId: 'export-x-9x16',
      kind: 'poster',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      path: 'renders/motion-aether-launch/export-x-9x16/poster.png',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
  ],
  provenance: [{ kind: 'timeline', ref: 'track-text' }],
};

describe('runner-backed motion render providers', () => {
  it('fails closed when no runner is configured', async () => {
    const provider = createRemotionRenderProvider();

    expect(provider).toMatchObject({
      id: 'remotion-local',
      engine: 'remotion',
      displayName: 'Remotion local render',
    });
    expect(provider.available()).toBe(false);
    await expect(provider.render(renderRequest)).rejects.toThrow(/requires a runner/);
  });

  it('executes a render request and normalizes runner receipts to planned outputs', async () => {
    const render = vi.fn(async (): Promise<MotionRenderRunnerResult> => ({
      outputs: [
        {
          outputId: 'render-export-x-9x16-video',
          assetUrl: 'file:///tmp/renders/video.mp4',
          provenance: [{ kind: 'provider', ref: 'remotion-cli' }],
        },
        {
          outputId: 'render-export-x-9x16-poster',
          assetUrl: 'file:///tmp/renders/poster.png',
        },
      ],
      provenance: [{ kind: 'provider', ref: 'remotion-cli' }],
    }));
    const provider = createRemotionRenderProvider({
      runner: { available: () => true, render },
    });

    const result = await provider.render(renderRequest);

    expect(render).toHaveBeenCalledWith(renderRequest);
    expect(result).toEqual({
      providerId: 'remotion-local',
      engine: 'remotion',
      outputs: [
        {
          ...renderRequest.outputs[0],
          assetUrl: 'file:///tmp/renders/video.mp4',
          provenance: [
            { kind: 'provider', ref: 'remotion-local' },
            { kind: 'timeline', ref: 'track-text' },
            { kind: 'provider', ref: 'remotion-cli' },
          ],
        },
        {
          ...renderRequest.outputs[1],
          assetUrl: 'file:///tmp/renders/poster.png',
          provenance: [
            { kind: 'provider', ref: 'remotion-local' },
            { kind: 'timeline', ref: 'track-text' },
          ],
        },
      ],
      provenance: [
        { kind: 'provider', ref: 'remotion-local' },
        { kind: 'timeline', ref: 'track-text' },
        { kind: 'provider', ref: 'remotion-cli' },
      ],
    });
  });

  it('rejects requests for the wrong render engine', async () => {
    const provider = createRunnerMotionRenderProvider({
      id: 'hyperframes-local',
      engine: 'hyperframes',
      displayName: 'HyperFrames local render',
      runner: {
        available: () => true,
        render: async () => ({ outputs: [], provenance: [] }),
      },
    });

    await expect(provider.render(renderRequest)).rejects.toThrow(
      /cannot render remotion requests/
    );
  });

  it('rejects runner receipts that do not match planned render outputs', async () => {
    const provider = createRemotionRenderProvider({
      runner: {
        available: () => true,
        render: async () => ({
          outputs: [{ outputId: 'render-unplanned-video', assetUrl: 'file:///tmp/extra.mp4' }],
          provenance: [],
        }),
      },
    });

    await expect(provider.render(renderRequest)).rejects.toThrow(
      /unplanned render output render-unplanned-video/
    );
  });

  it('creates HyperFrames providers without making them a default renderer', () => {
    const provider = createHyperFramesRenderProvider({
      runner: { available: () => true, render: async () => ({ outputs: [], provenance: [] }) },
    });

    expect(provider).toMatchObject({
      id: 'hyperframes-local',
      engine: 'hyperframes',
      displayName: 'HyperFrames local render',
    });
    expect(provider.available()).toBe(true);
  });
});
