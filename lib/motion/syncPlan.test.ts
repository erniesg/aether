import { describe, expect, it } from 'vitest';
import type { VoiceSynthesisResult } from '@/lib/providers/voice/types';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import { applyVoiceSynthesisResultToMotionProject } from './voiceApply';
import { buildMotionSyncPlan } from './syncPlan';

function project() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

function readyVoiceResult(voiceClipId: string, durationMs: number): VoiceSynthesisResult {
  return {
    providerId: 'test-voice',
    artifacts: [
      {
        id: `voice-${voiceClipId}-audio`,
        kind: 'audio',
        mimeType: 'audio/mpeg',
        path: `voice/${voiceClipId}.mp3`,
        assetUrl: `file:///voice/${voiceClipId}.mp3`,
        durationMs,
        provenance: [{ kind: 'voice', ref: `provider:${voiceClipId}` }],
      },
      {
        id: `voice-${voiceClipId}-word-timings`,
        kind: 'word-timings',
        mimeType: 'application/json',
        path: `voice/${voiceClipId}.words.json`,
        assetUrl: `file:///voice/${voiceClipId}.words.json`,
        provenance: [{ kind: 'voice', ref: `words:${voiceClipId}` }],
      },
      {
        id: `voice-${voiceClipId}-transcript`,
        kind: 'transcript',
        mimeType: 'text/plain',
        path: `voice/${voiceClipId}.txt`,
        assetUrl: `file:///voice/${voiceClipId}.txt`,
        provenance: [{ kind: 'voice', ref: `transcript:${voiceClipId}` }],
      },
    ],
    provenance: [{ kind: 'provider', ref: 'test-voice' }],
  };
}

function withReadyVoice() {
  return project()
    .tracks.find((track) => track.kind === 'voice')!
    .clips.reduce(
      (nextProject, clip) =>
        applyVoiceSynthesisResultToMotionProject(
          nextProject,
          readyVoiceResult(clip.id, clip.durationFrames * (1000 / 30)),
          { clipId: clip.id, updatedAt: 120 }
        ),
      project()
    );
}

describe('buildMotionSyncPlan', () => {
  it('returns timeline markers and voice blockers before narration receipts exist', () => {
    const plan = buildMotionSyncPlan(project(), { requestedAt: 200 });

    expect(plan).toMatchObject({
      id: 'sync-plan-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'needs-voice',
      providerRequirements: ['voice-synthesis', 'word-timing-alignment'],
      requestedAt: 200,
      syncNode: {
        id: 'node-sync-plan',
        kind: 'sync',
        status: 'planned',
      },
    });
    expect(plan.blockers).toEqual([
      {
        id: 'voice-receipts-required',
        label: 'Generate voice and word timings before final sync',
      },
    ]);
    expect(plan.beatMarkers.map((marker) => marker.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(plan.beatMarkers[0]).toMatchObject({
      beatId: 'beat-hook',
      textClipId: 'clip-beat-hook-text',
      captionClipId: 'clip-beat-hook-caption',
      voiceClipId: 'clip-beat-hook-voice',
      startSeconds: 0,
      durationSeconds: 3,
      voiceStatus: 'planned',
      captionTimingSource: 'timeline',
    });
    expect(plan.captionLinks[0]).toMatchObject({
      captionClipId: 'clip-beat-hook-caption',
      voiceClipId: 'clip-beat-hook-voice',
      timingSource: 'timeline',
    });
    expect(plan.transitionCues[0]).toMatchObject({
      clipId: 'clip-transition-beat-hook-to-beat-problem',
      fromBeatId: 'beat-hook',
      toBeatId: 'beat-problem',
      startSeconds: 2.633,
      durationSeconds: 0.367,
    });
    expect(plan.soundCues[0]).toMatchObject({
      id: 'sfx-clip-transition-beat-hook-to-beat-problem',
      kind: 'transition',
      startSeconds: 2.633,
      label: 'Soft transition accent',
    });
  });

  it('marks the sync plan ready when voice clips have audio and word timings', () => {
    const plan = buildMotionSyncPlan(withReadyVoice(), { requestedAt: 201 });

    expect(plan.status).toBe('ready');
    expect(plan.blockers).toEqual([]);
    expect(plan.providerRequirements).toEqual([]);
    expect(plan.beatMarkers.every((marker) => marker.voiceStatus === 'ready')).toBe(true);
    expect(
      plan.captionLinks.every((link) => link.timingSource === 'word-timings')
    ).toBe(true);
    expect(plan.beatMarkers[0]).toMatchObject({
      audioAssetId: 'voice-clip-beat-hook-voice-audio',
      wordTimingsAssetId: 'voice-clip-beat-hook-voice-word-timings',
      transcriptAssetId: 'voice-clip-beat-hook-voice-transcript',
    });
    expect(plan.syncNode).toMatchObject({
      inputRefs: expect.arrayContaining([
        'track-text',
        'track-caption',
        'track-voice',
        'track-transition',
      ]),
      outputRefs: expect.arrayContaining([
        'sync-marker-beat-hook',
        'caption-link-clip-beat-hook-caption',
      ]),
    });
  });

  it('returns a timeline blocker before clips are materialized', () => {
    const unmaterialized = buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript'],
      },
      claims: [
        {
          text: 'aether is sourced from repo facts.',
          source: { kind: 'repo', ref: 'README.md' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    });

    const plan = buildMotionSyncPlan(unmaterialized, { requestedAt: 202 });

    expect(plan).toMatchObject({
      status: 'needs-timeline',
      beatMarkers: [],
      captionLinks: [],
      transitionCues: [],
      soundCues: [],
      blockers: [
        {
          id: 'timeline-required',
          label: 'Materialize timeline before sync planning',
        },
      ],
    });
  });
});
