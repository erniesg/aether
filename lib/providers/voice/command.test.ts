import { describe, expect, it, vi } from 'vitest';
import {
  createCommandVoiceProvider,
  type VoiceCommandCall,
} from './command';
import type { VoiceSynthesisRequest } from './types';

const request: VoiceSynthesisRequest = {
  id: 'voice-clip-beat-hook-voice',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  clipId: 'clip-beat-hook-voice',
  trackId: 'track-voice',
  text: 'Aether turns repo evidence into editable launch videos.',
  voiceId: 'calm-launch-narrator',
  startFrame: 0,
  durationFrames: 90,
  fps: 30,
  expectedArtifacts: [
    {
      id: 'voice-clip-beat-hook-voice-audio',
      kind: 'audio',
      mimeType: 'audio/mpeg',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3',
      provenance: [{ kind: 'timeline', ref: 'clip-beat-hook-voice' }],
    },
    {
      id: 'voice-clip-beat-hook-voice-word-timings',
      kind: 'word-timings',
      mimeType: 'application/json',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.words.json',
      provenance: [{ kind: 'timeline', ref: 'clip-beat-hook-voice' }],
    },
    {
      id: 'voice-clip-beat-hook-voice-transcript',
      kind: 'transcript',
      mimeType: 'text/plain',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.txt',
      provenance: [{ kind: 'timeline', ref: 'clip-beat-hook-voice' }],
    },
  ],
  provenance: [{ kind: 'timeline', ref: 'track-voice' }],
};

describe('createCommandVoiceProvider', () => {
  it('writes a synthesis payload, runs the configured command, and maps expected artifact files', async () => {
    const files = new Set<string>();
    const writes = new Map<string, string>();
    const calls: VoiceCommandCall[] = [];
    const runCommand = vi.fn(async (call: VoiceCommandCall) => {
      calls.push(call);
      files.add('/repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3');
      files.add('/repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.words.json');
      files.add('/repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.txt');
    });
    const provider = createCommandVoiceProvider({
      id: 'voice-command',
      displayName: 'Command voice synthesis',
      projectDir: '/repo',
      command: 'node',
      args: ['scripts/tts.mjs'],
      runCommand,
      fileExists: async (filePath) => files.has(filePath),
      writeTextFile: async (filePath, contents) => {
        writes.set(filePath, contents);
        files.add(filePath);
      },
    });

    const result = await provider.synthesize(request);

    expect(provider.available()).toBe(true);
    expect(calls).toEqual([
      {
        command: 'node',
        args: [
          'scripts/tts.mjs',
          '/repo/.aether/voice-requests/voice-clip-beat-hook-voice.json',
        ],
        cwd: '/repo',
        requestPath: '/repo/.aether/voice-requests/voice-clip-beat-hook-voice.json',
      },
    ]);
    const payload = JSON.parse(
      writes.get('/repo/.aether/voice-requests/voice-clip-beat-hook-voice.json') ?? ''
    );
    expect(payload).toMatchObject({
      id: 'voice-clip-beat-hook-voice',
      text: 'Aether turns repo evidence into editable launch videos.',
      voiceId: 'calm-launch-narrator',
      targetSeconds: 3,
    });
    expect(payload.expectedArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'voice-clip-beat-hook-voice-audio',
          absolutePath:
            '/repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3',
        }),
      ])
    );
    expect(result).toMatchObject({
      providerId: 'voice-command',
      artifacts: [
        {
          id: 'voice-clip-beat-hook-voice-audio',
          assetUrl:
            'file:///repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3',
          provenance: [
            { kind: 'provider', ref: 'voice-command' },
            { kind: 'timeline', ref: 'clip-beat-hook-voice' },
          ],
        },
        {
          id: 'voice-clip-beat-hook-voice-word-timings',
          assetUrl:
            'file:///repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.words.json',
        },
        {
          id: 'voice-clip-beat-hook-voice-transcript',
          assetUrl:
            'file:///repo/voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.txt',
        },
      ],
      provenance: [
        { kind: 'provider', ref: 'voice-command' },
        { kind: 'timeline', ref: 'track-voice' },
      ],
    });
  });

  it('uses structured command output for asset URLs and duration', async () => {
    const provider = createCommandVoiceProvider({
      id: 'voice-command',
      displayName: 'Command voice synthesis',
      projectDir: '/repo',
      command: 'node',
      runCommand: vi.fn(async () => ({
        artifacts: [
          {
            id: 'voice-clip-beat-hook-voice-audio',
            assetUrl: 'asset://voice/audio.mp3',
            durationMs: 2940,
          },
          {
            id: 'voice-clip-beat-hook-voice-word-timings',
            assetUrl: 'asset://voice/words.json',
          },
          {
            id: 'voice-clip-beat-hook-voice-transcript',
            assetUrl: 'asset://voice/transcript.txt',
          },
        ],
      })),
      fileExists: async () => false,
      writeTextFile: async () => undefined,
    });

    const result = await provider.synthesize(request);

    expect(result.artifacts[0]).toMatchObject({
      id: 'voice-clip-beat-hook-voice-audio',
      assetUrl: 'asset://voice/audio.mp3',
      durationMs: 2940,
    });
  });

  it('rejects unplanned command artifacts', async () => {
    const provider = createCommandVoiceProvider({
      id: 'voice-command',
      displayName: 'Command voice synthesis',
      projectDir: '/repo',
      command: 'node',
      runCommand: vi.fn(async () => ({
        artifacts: [{ id: 'voice-extra-audio', assetUrl: 'asset://extra.mp3' }],
      })),
      writeTextFile: async () => undefined,
    });

    await expect(provider.synthesize(request)).rejects.toThrow(
      /returned unplanned voice artifact voice-extra-audio/
    );
  });

  it('rejects incomplete structured command output', async () => {
    const provider = createCommandVoiceProvider({
      id: 'voice-command',
      displayName: 'Command voice synthesis',
      projectDir: '/repo',
      command: 'node',
      runCommand: vi.fn(async () => ({
        artifacts: [
          {
            id: 'voice-clip-beat-hook-voice-audio',
            assetUrl: 'asset://voice/audio.mp3',
          },
        ],
      })),
      writeTextFile: async () => undefined,
    });

    await expect(provider.synthesize(request)).rejects.toThrow(
      /did not return planned voice artifact voice-clip-beat-hook-voice-word-timings/
    );
  });

  it('is unavailable without both a project directory and command', () => {
    expect(
      createCommandVoiceProvider({
        id: 'voice-command',
        displayName: 'Command voice synthesis',
        projectDir: '',
        command: 'node',
      }).available()
    ).toBe(false);
    expect(
      createCommandVoiceProvider({
        id: 'voice-command',
        displayName: 'Command voice synthesis',
        projectDir: '/repo',
        command: '',
      }).available()
    ).toBe(false);
  });
});
