import { describe, expect, it, vi } from 'vitest';
import {
  createCommandImageToVideoProvider,
  type ImageToVideoCommandCall,
} from './command-image-to-video';
import type { MotionImageToVideoRequest } from './types';

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
  prompt:
    'Animate aether as a short product video clip. Keep existing UI text crisp.',
  aspectRatio: '9:16',
  fps: 30,
  durationFrames: 90,
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

describe('createCommandImageToVideoProvider', () => {
  it('writes a generation payload, runs the configured command, and maps the expected MP4 artifact', async () => {
    const files = new Set<string>();
    const writes = new Map<string, string>();
    const calls: ImageToVideoCommandCall[] = [];
    const runCommand = vi.fn(async (call: ImageToVideoCommandCall) => {
      calls.push(call);
      files.add(
        '/repo/generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4'
      );
    });
    const provider = createCommandImageToVideoProvider({
      id: 'image-video-command',
      displayName: 'Command image-to-video generation',
      projectDir: '/repo',
      command: 'node',
      args: ['scripts/image-to-video.mjs'],
      runCommand,
      fileExists: async (filePath) => files.has(filePath),
      writeTextFile: async (filePath, contents) => {
        writes.set(filePath, contents);
        files.add(filePath);
      },
    });

    const result = await provider.generate(request);

    expect(provider.available()).toBe(true);
    expect(calls).toEqual([
      {
        command: 'node',
        args: [
          'scripts/image-to-video.mjs',
          '/repo/.aether/image-to-video-requests/image-to-video-clip-beat-demo-text.json',
        ],
        cwd: '/repo',
        requestPath:
          '/repo/.aether/image-to-video-requests/image-to-video-clip-beat-demo-text.json',
      },
    ]);
    const payload = JSON.parse(
      writes.get(
        '/repo/.aether/image-to-video-requests/image-to-video-clip-beat-demo-text.json'
      ) ?? ''
    );
    expect(payload).toMatchObject({
      id: 'image-to-video-clip-beat-demo-text',
      prompt:
        'Animate aether as a short product video clip. Keep existing UI text crisp.',
      source: {
        assetId: 'capture-screenshot-aether-localhost',
        assetUrl: 'asset://capture/aether-home.png',
      },
      output: {
        id: 'generated-clip-beat-demo-text-image-to-video',
        absolutePath:
          '/repo/generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
      },
    });
    expect(result).toMatchObject({
      providerId: 'image-video-command',
      artifacts: [
        {
          id: 'generated-clip-beat-demo-text-image-to-video',
          clipId: 'clip-beat-demo-text',
          sourceAssetId: 'capture-screenshot-aether-localhost',
          requestId: 'image-to-video-clip-beat-demo-text',
          assetUrl:
            'file:///repo/generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
          provenance: [
            { kind: 'provider', ref: 'image-video-command' },
            { kind: 'timeline', ref: 'clip-beat-demo-text' },
          ],
        },
      ],
      provenance: [
        { kind: 'provider', ref: 'image-video-command' },
        { kind: 'timeline', ref: 'clip-beat-demo-text' },
      ],
    });
  });

  it('uses structured command output for asset URL and duration', async () => {
    const provider = createCommandImageToVideoProvider({
      id: 'image-video-command',
      displayName: 'Command image-to-video generation',
      projectDir: '/repo',
      command: 'node',
      runCommand: vi.fn(async () => ({
        artifact: {
          id: 'generated-clip-beat-demo-text-image-to-video',
          assetUrl: 'asset://generated/demo.mp4',
          durationMs: 2960,
        },
      })),
      writeTextFile: async () => undefined,
    });

    const result = await provider.generate(request);

    expect(result.artifacts).toEqual([
      expect.objectContaining({
        id: 'generated-clip-beat-demo-text-image-to-video',
        assetUrl: 'asset://generated/demo.mp4',
        durationMs: 2960,
      }),
    ]);
  });

  it('rejects unplanned command artifacts', async () => {
    const provider = createCommandImageToVideoProvider({
      id: 'image-video-command',
      displayName: 'Command image-to-video generation',
      projectDir: '/repo',
      command: 'node',
      runCommand: vi.fn(async () => ({
        artifact: { id: 'generated-extra', assetUrl: 'asset://extra.mp4' },
      })),
      writeTextFile: async () => undefined,
    });

    await expect(provider.generate(request)).rejects.toThrow(
      /returned unplanned image-to-video artifact generated-extra/
    );
  });

  it('is unavailable without both a project directory and command', () => {
    expect(
      createCommandImageToVideoProvider({
        projectDir: '',
        command: 'node',
      }).available()
    ).toBe(false);
    expect(
      createCommandImageToVideoProvider({
        projectDir: '/repo',
        command: '',
      }).available()
    ).toBe(false);
  });
});
