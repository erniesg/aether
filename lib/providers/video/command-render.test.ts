import { describe, expect, it, vi } from 'vitest';
import {
  createHyperFramesCommandRenderRunner,
  createRemotionCommandRenderRunner,
  type RenderCommandCall,
} from './command-render';
import type { MotionRenderRequest } from './types';

const request: MotionRenderRequest = {
  id: 'render-plan-motion-aether-launch-draft-primary-remotion',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  engine: 'remotion',
  compositionId: 'motion-aether-launch-draft-primary',
  fps: 30,
  durationFrames: 900,
  tracks: [
    {
      id: 'track-caption',
      kind: 'caption',
      clips: [
        {
          id: 'clip-caption-hook',
          startFrame: 0,
          durationFrames: 90,
          componentId: 'caption-line',
          props: { text: 'Aether turns repo evidence into launch videos.' },
          provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
        },
        {
          id: 'clip-caption-proof',
          startFrame: 90,
          durationFrames: 120,
          componentId: 'caption-line',
          props: { text: 'The export pack stays editable across formats.' },
          provenance: [{ kind: 'story-beat', ref: 'beat-proof' }],
        },
      ],
    },
  ],
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
      provenance: [{ kind: 'timeline', ref: 'track-caption' }],
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
      provenance: [{ kind: 'timeline', ref: 'track-caption' }],
    },
    {
      id: 'render-export-x-9x16-subtitle',
      exportId: 'export-x-9x16',
      kind: 'subtitle',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'text/vtt',
      path: 'renders/motion-aether-launch/export-x-9x16/subtitles.vtt',
      provenance: [{ kind: 'timeline', ref: 'track-caption' }],
    },
    {
      id: 'render-export-x-9x16-transcript',
      exportId: 'export-x-9x16',
      kind: 'transcript',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'text/plain',
      path: 'renders/motion-aether-launch/export-x-9x16/transcript.txt',
      provenance: [{ kind: 'timeline', ref: 'track-caption' }],
    },
    {
      id: 'render-export-x-9x16-manifest',
      exportId: 'export-x-9x16',
      kind: 'manifest',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'application/json',
      path: 'renders/motion-aether-launch/export-x-9x16/manifest.json',
      provenance: [{ kind: 'timeline', ref: 'track-caption' }],
    },
  ],
  provenance: [{ kind: 'timeline', ref: 'track-caption' }],
};

function testIo() {
  const commands: RenderCommandCall[] = [];
  const files = new Set<string>();
  const writes = new Map<string, string>();
  const runCommand = vi.fn(async (call: RenderCommandCall) => {
    commands.push(call);
    const outputPath = [...call.args].reverse().find((arg) => /\.(mp4|png)$/.test(arg));
    if (outputPath) files.add(outputPath);
  });
  const writeTextFile = vi.fn(async (filePath: string, contents: string) => {
    files.add(filePath);
    writes.set(filePath, contents);
  });

  return {
    commands,
    files,
    writes,
    runCommand,
    writeTextFile,
    fileExists: async (filePath: string) => files.has(filePath),
  };
}

describe('command render runners', () => {
  it('runs Remotion render/still commands and writes planned sidecar artifacts', async () => {
    const io = testIo();
    const runner = createRemotionCommandRenderRunner({
      projectDir: '/repo',
      entryPoint: 'remotion/index.ts',
      runCommand: io.runCommand,
      fileExists: io.fileExists,
      writeTextFile: io.writeTextFile,
    });

    const result = await runner.render(request);

    expect(runner.available()).toBe(true);
    expect(io.commands).toEqual([
      {
        command: 'npx',
        args: [
          'remotion',
          'render',
          'remotion/index.ts',
          'motion-aether-launch-draft-primary',
          '/repo/renders/motion-aether-launch/export-x-9x16/video.mp4',
          '--fps',
          '30',
          '--duration',
          '900',
          '--width',
          '1080',
          '--height',
          '1920',
          '--props',
          '/repo/renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.props.json',
        ],
        cwd: '/repo',
      },
      {
        command: 'npx',
        args: [
          'remotion',
          'still',
          'remotion/index.ts',
          'motion-aether-launch-draft-primary',
          '/repo/renders/motion-aether-launch/export-x-9x16/poster.png',
          '--frame',
          '0',
          '--width',
          '1080',
          '--height',
          '1920',
          '--props',
          '/repo/renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.props.json',
        ],
        cwd: '/repo',
      },
    ]);
    expect(io.writes.get('/repo/renders/motion-aether-launch/export-x-9x16/subtitles.vtt')).toContain(
      '00:00:00.000 --> 00:00:03.000'
    );
    expect(io.writes.get('/repo/renders/motion-aether-launch/export-x-9x16/transcript.txt')).toContain(
      'Aether turns repo evidence into launch videos.'
    );
    expect(io.writes.get('/repo/renders/motion-aether-launch/export-x-9x16/manifest.json')).toContain(
      '"compositionId": "motion-aether-launch-draft-primary"'
    );
    expect(io.writes.get('/repo/renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.props.json')).toContain(
      '"tracks"'
    );
    expect(result.outputs.map((output) => output.outputId)).toEqual(
      request.outputs.map((output) => output.id)
    );
    expect(result.outputs[0]).toMatchObject({
      outputId: 'render-export-x-9x16-video',
      assetUrl: 'file:///repo/renders/motion-aether-launch/export-x-9x16/video.mp4',
      provenance: [{ kind: 'provider', ref: 'remotion-command-runner' }],
    });
  });

  it('runs HyperFrames render/snapshot commands with project-root cwd', async () => {
    const io = testIo();
    const hyperframesRequest: MotionRenderRequest = {
      ...request,
      engine: 'hyperframes',
      id: 'render-plan-motion-aether-launch-draft-primary-hyperframes',
    };
    const runner = createHyperFramesCommandRenderRunner({
      projectDir: '/hyperframes-project',
      runCommand: io.runCommand,
      fileExists: io.fileExists,
      writeTextFile: io.writeTextFile,
    });

    const result = await runner.render(hyperframesRequest);

    expect(io.commands).toEqual([
      {
        command: 'npx',
        args: [
          'hyperframes',
          'render',
          '--output',
          '/hyperframes-project/renders/motion-aether-launch/export-x-9x16/video.mp4',
          '--fps',
          '30',
          '--quality',
          'standard',
        ],
        cwd: '/hyperframes-project',
      },
      {
        command: 'npx',
        args: [
          'hyperframes',
          'snapshot',
          '.',
          '--at',
          '0',
          '--output',
          '/hyperframes-project/renders/motion-aether-launch/export-x-9x16/poster.png',
        ],
        cwd: '/hyperframes-project',
      },
    ]);
    expect(result.provenance).toContainEqual({
      kind: 'provider',
      ref: 'hyperframes-command-runner',
    });
  });

  it('writes generated render source files before invoking engine commands', async () => {
    const io = testIo();
    const runner = createRemotionCommandRenderRunner({
      projectDir: '/repo',
      entryPoint: 'remotion/index.tsx',
      runCommand: io.runCommand,
      fileExists: io.fileExists,
      writeTextFile: io.writeTextFile,
    });

    await runner.render({
      ...request,
      sourceFiles: [
        {
          kind: 'entry',
          path: 'remotion/index.tsx',
          mimeType: 'text/typescript',
          contents: '// generated remotion source',
          provenance: [{ kind: 'render', ref: request.id }],
        },
      ],
    });

    expect(io.writes.get('/repo/remotion/index.tsx')).toBe('// generated remotion source');
    expect(io.commands[0]?.args).toContain('remotion/index.tsx');
  });

  it('fails when the engine command does not produce a planned artifact', async () => {
    const runner = createRemotionCommandRenderRunner({
      projectDir: '/repo',
      entryPoint: 'remotion/index.ts',
      runCommand: async () => {},
      fileExists: async () => false,
      writeTextFile: async () => {},
    });

    await expect(runner.render(request)).rejects.toThrow(
      /render command did not produce .*video\.mp4/
    );
  });
});
