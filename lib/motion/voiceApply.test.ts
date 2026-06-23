import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import { applyVoiceSynthesisResultToMotionProject } from './voiceApply';
import type { VoiceSynthesisResult } from '@/lib/providers/voice/types';

function projectWithTimeline() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'Uses Next.js, Convex, and tldraw.',
          source: { kind: 'repo', ref: 'package.json#dependencies' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    }),
    { updatedAt: 12 }
  );
}

const voiceResult: VoiceSynthesisResult = {
  providerId: 'local-tts',
  artifacts: [
    {
      id: 'voice-clip-beat-hook-voice-audio',
      kind: 'audio',
      mimeType: 'audio/mpeg',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3',
      assetUrl: 'asset://voice/hook.mp3',
      durationMs: 2800,
      provenance: [{ kind: 'provider', ref: 'local-tts' }],
    },
    {
      id: 'voice-clip-beat-hook-voice-word-timings',
      kind: 'word-timings',
      mimeType: 'application/json',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.words.json',
      assetUrl: 'asset://voice/hook.words.json',
      provenance: [{ kind: 'provider', ref: 'local-tts' }],
    },
    {
      id: 'voice-clip-beat-hook-voice-transcript',
      kind: 'transcript',
      mimeType: 'text/plain',
      path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.txt',
      assetUrl: 'asset://voice/hook.txt',
      provenance: [{ kind: 'provider', ref: 'local-tts' }],
    },
  ],
  provenance: [{ kind: 'provider', ref: 'local-tts' }],
};

function audioOnlyResultFor(clipId: string): VoiceSynthesisResult {
  return {
    providerId: 'local-tts',
    artifacts: [
      {
        id: `voice-${clipId}-audio`,
        kind: 'audio',
        mimeType: 'audio/mpeg',
        path: `voice/motion-aether-launch/draft-primary/${clipId}.mp3`,
        assetUrl: `asset://voice/${clipId}.mp3`,
        durationMs: 3000,
        provenance: [{ kind: 'provider', ref: 'local-tts' }],
      },
    ],
    provenance: [{ kind: 'provider', ref: 'local-tts' }],
  };
}

describe('applyVoiceSynthesisResultToMotionProject', () => {
  it('turns voice receipts into editable audio and caption timing assets', () => {
    const updated = applyVoiceSynthesisResultToMotionProject(
      projectWithTimeline(),
      voiceResult,
      { clipId: 'clip-beat-hook-voice', updatedAt: 70 }
    );

    expect(updated.updatedAt).toBe(70);

    const voiceClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-hook-voice');
    expect(voiceClip).toMatchObject({
      assetId: 'voice-clip-beat-hook-voice-audio',
      props: {
        audioAssetId: 'voice-clip-beat-hook-voice-audio',
        audioUrl: 'asset://voice/hook.mp3',
        voiceProviderId: 'local-tts',
        durationMs: 2800,
        wordTimingsAssetId: 'voice-clip-beat-hook-voice-word-timings',
        wordTimingsUrl: 'asset://voice/hook.words.json',
        transcriptAssetId: 'voice-clip-beat-hook-voice-transcript',
        transcriptUrl: 'asset://voice/hook.txt',
        status: 'ready',
      },
    });
    expect(voiceClip?.provenance).toContainEqual({
      kind: 'voice',
      ref: 'voice-clip-beat-hook-voice-audio',
    });

    const captionClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-hook-caption');
    expect(captionClip).toMatchObject({
      props: {
        wordTimingsAssetId: 'voice-clip-beat-hook-voice-word-timings',
        wordTimingsUrl: 'asset://voice/hook.words.json',
        transcriptAssetId: 'voice-clip-beat-hook-voice-transcript',
        transcriptUrl: 'asset://voice/hook.txt',
        voiceClipId: 'clip-beat-hook-voice',
      },
    });
    expect(captionClip?.provenance).toContainEqual({
      kind: 'voice',
      ref: 'voice-clip-beat-hook-voice-word-timings',
    });

    const untouchedVoiceClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-problem-voice');
    expect(untouchedVoiceClip?.assetId).toBeUndefined();
    expect(untouchedVoiceClip?.props).toMatchObject({ status: 'planned' });

    const voiceNode = updated.graphNodes.find((node) => node.id === 'node-voice-plan');
    expect(voiceNode).toMatchObject({
      kind: 'voice',
      status: 'done',
      providerId: 'local-tts',
      inputRefs: ['clip-beat-hook-voice'],
      outputRefs: [
        'voice-clip-beat-hook-voice-audio',
        'voice-clip-beat-hook-voice-word-timings',
        'voice-clip-beat-hook-voice-transcript',
      ],
    });
  });

  it('merges voice graph receipts across separately completed clips', () => {
    const afterHook = applyVoiceSynthesisResultToMotionProject(
      projectWithTimeline(),
      audioOnlyResultFor('clip-beat-hook-voice'),
      { clipId: 'clip-beat-hook-voice', updatedAt: 70 }
    );
    const afterProblem = applyVoiceSynthesisResultToMotionProject(
      afterHook,
      audioOnlyResultFor('clip-beat-problem-voice'),
      { clipId: 'clip-beat-problem-voice', updatedAt: 71 }
    );

    expect(afterProblem.graphNodes.find((node) => node.id === 'node-voice-plan')).toMatchObject({
      inputRefs: ['clip-beat-hook-voice', 'clip-beat-problem-voice'],
      outputRefs: [
        'voice-clip-beat-hook-voice-audio',
        'voice-clip-beat-problem-voice-audio',
      ],
    });
  });
});
