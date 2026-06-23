import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import { buildMotionVoicePlan } from './voicePlan';

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

describe('buildMotionVoicePlan', () => {
  it('turns voice timeline clips into synthesis and word-timing requests', () => {
    const plan = buildMotionVoicePlan(projectWithTimeline(), {
      requestedAt: 60,
      voiceId: 'calm-launch-narrator',
    });

    expect(plan).toMatchObject({
      id: 'voice-plan-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'ready',
      providerRequirements: ['voice-synthesis', 'word-timing-alignment'],
      requestedAt: 60,
    });
    expect(plan.requests).toHaveLength(6);
    expect(plan.requests[0]).toMatchObject({
      id: 'voice-clip-beat-hook-voice',
      clipId: 'clip-beat-hook-voice',
      trackId: 'track-voice',
      startFrame: 0,
      durationFrames: 90,
      targetSeconds: 3,
      text: 'aether: Canvas-native creative system.',
      voiceId: 'calm-launch-narrator',
      expectedArtifacts: [
        {
          id: 'voice-clip-beat-hook-voice-audio',
          kind: 'audio',
          mimeType: 'audio/mpeg',
          path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.mp3',
        },
        {
          id: 'voice-clip-beat-hook-voice-word-timings',
          kind: 'word-timings',
          mimeType: 'application/json',
          path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.words.json',
        },
        {
          id: 'voice-clip-beat-hook-voice-transcript',
          kind: 'transcript',
          mimeType: 'text/plain',
          path: 'voice/motion-aether-launch/draft-primary/clip-beat-hook-voice.txt',
        },
      ],
    });
    expect(plan.requests[0].provenance).toContainEqual({
      kind: 'story-beat',
      ref: 'beat-hook',
    });
    expect(plan.voiceNode).toMatchObject({
      id: 'node-voice-plan',
      kind: 'voice',
      status: 'planned',
      inputRefs: [
        'clip-beat-hook-voice',
        'clip-beat-problem-voice',
        'clip-beat-proof-voice',
        'clip-beat-demo-voice',
        'clip-beat-payoff-voice',
        'clip-beat-cta-voice',
      ],
    });
    expect(plan.voiceNode?.outputRefs).toContain('voice-clip-beat-hook-voice-audio');
    expect(plan.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'track-voice',
    });
  });

  it('reports missing timeline work before requesting voice synthesis', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js'],
      },
      claims: [],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    const plan = buildMotionVoicePlan(project, { requestedAt: 61 });

    expect(plan).toMatchObject({
      status: 'needs-timeline',
      requests: [],
      voiceNode: null,
      providerRequirements: [],
    });
    expect(plan.blockers).toEqual([
      {
        id: 'voice-track-required',
        label: 'Materialize voice timeline before synthesis',
      },
    ]);
  });
});
