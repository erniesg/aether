import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { MotionRenderRequest } from './types';
import { createDraftMotionRenderProvider } from './draft-render';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Aether local draft renderer', () => {
  it('renders edited scene and caption tracks into a playable proof pack', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'aether-draft-render-'));
    temporaryRoots.push(outputRoot);
    const provider = createDraftMotionRenderProvider({ outputRoot });

    const result = await provider.render(renderRequest());
    const videoPath = path.join(outputRoot, 'renders/test/video.mp4');
    const posterPath = path.join(outputRoot, 'renders/test/poster.png');
    const subtitlePath = path.join(outputRoot, 'renders/test/subtitles.vtt');
    const transcriptPath = path.join(outputRoot, 'renders/test/transcript.txt');
    const manifestPath = path.join(outputRoot, 'renders/test/manifest.json');
    const probe = JSON.parse(
      (
        await execFileAsync('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration:stream=codec_type,codec_name',
          '-of',
          'json',
          videoPath,
        ])
      ).stdout
    ) as {
      streams: Array<{ codec_type: string; codec_name: string }>;
      format: { duration: string };
    };

    expect(result).toMatchObject({
      providerId: 'aether-draft-render',
      engine: 'remotion',
    });
    expect(result.outputs).toHaveLength(5);
    expect(result.outputs[0]?.assetUrl).toMatch(/^file:/);
    expect(probe.streams).toEqual(
      expect.arrayContaining([
        { codec_type: 'video', codec_name: 'h264' },
        { codec_type: 'audio', codec_name: 'aac' },
      ])
    );
    expect(Number(probe.format.duration)).toBeCloseTo(1, 1);
    expect((await readFile(posterPath)).subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a'
    );
    expect(await readFile(subtitlePath, 'utf8')).toContain('Edited scene copy');
    expect(await readFile(transcriptPath, 'utf8')).toContain('Edited scene copy');
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({
      providerId: 'aether-draft-render',
      sceneCount: 1,
    });
  }, 15000);
});

function renderRequest(): MotionRenderRequest {
  const provenance = [{ kind: 'timeline' as const, ref: 'track-text' }];
  return {
    id: 'render-draft-test',
    projectId: 'motion-draft-test',
    draftId: 'draft-primary',
    engine: 'remotion',
    compositionId: 'motion-draft-test',
    fps: 30,
    durationFrames: 30,
    tracks: [
      {
        id: 'track-text',
        kind: 'text',
        clips: [
          {
            id: 'clip-text',
            componentId: 'code-diff-card',
            startFrame: 0,
            durationFrames: 30,
            props: { text: 'Edited scene copy' },
            provenance,
          },
        ],
      },
      {
        id: 'track-caption',
        kind: 'caption',
        clips: [
          {
            id: 'clip-caption',
            componentId: 'caption-line',
            startFrame: 0,
            durationFrames: 30,
            props: { caption: 'Edited scene copy' },
            provenance,
          },
        ],
      },
      {
        id: 'track-voice',
        kind: 'voice',
        clips: [
          {
            id: 'clip-voice',
            componentId: 'voice-line',
            startFrame: 0,
            durationFrames: 30,
            props: { narration: 'Edited scene copy' },
            provenance,
          },
        ],
      },
    ],
    outputs: [
      output('video', 'video/mp4', 'renders/test/video.mp4'),
      output('poster', 'image/png', 'renders/test/poster.png'),
      output('subtitle', 'text/vtt', 'renders/test/subtitles.vtt'),
      output('transcript', 'text/plain', 'renders/test/transcript.txt'),
      output('manifest', 'application/json', 'renders/test/manifest.json'),
    ],
    provenance,
  };
}

function output(
  kind: 'video' | 'poster' | 'subtitle' | 'transcript' | 'manifest',
  mimeType: string,
  outputPath: string
) {
  return {
    id: `output-${kind}`,
    exportId: 'export-test',
    kind,
    platform: 'x' as const,
    aspectRatio: '16:9' as const,
    width: 320,
    height: 180,
    mimeType,
    path: outputPath,
    provenance: [{ kind: 'timeline' as const, ref: 'track-text' }],
  };
}
