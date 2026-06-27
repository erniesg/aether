import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { applyVoiceSynthesisResultToMotionProject } from '@/lib/motion/voiceApply';
import { buildMotionVoicePlan } from '@/lib/motion/voicePlan';
import type {
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';

function project(): MotionProject {
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

function voiceReadyProject(): MotionProject {
  const timelineProject = project();
  const voicePlan = buildMotionVoicePlan(timelineProject, { requestedAt: 982 });

  return voicePlan.requests.reduce(
    (nextProject, request) =>
      applyVoiceSynthesisResultToMotionProject(nextProject, voiceResultFor(request), {
        clipId: request.clipId,
        updatedAt: 983,
      }),
    timelineProject
  );
}

function voiceResultFor(request: VoiceSynthesisRequest): VoiceSynthesisResult {
  return {
    providerId: 'voice-test',
    artifacts: request.expectedArtifacts.map((artifact) => ({
      ...artifact,
      assetUrl: `asset://${artifact.path}`,
      ...(artifact.kind === 'audio' ? { durationMs: request.durationFrames * 30 } : {}),
      provenance: [{ kind: 'provider', ref: 'voice-test' }, ...artifact.provenance],
    })),
    provenance: [{ kind: 'provider', ref: 'voice-test' }],
  };
}

describe('POST /api/motion/sync', () => {
  it('returns an agent-readable sync plan with refreshed review and preview plans', async () => {
    const { POST } = await import('@/app/api/motion/sync/route');

    const res = await POST(
      new Request('http://localhost/api/motion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestedAt: 980,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      syncPlan: {
        id: 'sync-plan-motion-aether-launch-draft-primary',
        projectId: 'motion-aether-launch',
        status: 'needs-voice',
        blockers: [
          {
            id: 'voice-receipts-required',
          },
        ],
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
    });
    expect(json.syncPlan.beatMarkers[0]).toMatchObject({
      beatId: 'beat-hook',
      captionClipId: 'clip-beat-hook-caption',
      voiceClipId: 'clip-beat-hook-voice',
      captionTimingSource: 'timeline',
    });
    expect(json.syncPlan.transitionCues.length).toBeGreaterThan(0);
    expect(json.syncPlan.soundCues.length).toBeGreaterThan(0);
  });

  it('applies ready sync markers, captions, transitions, and receipts to the project', async () => {
    const { POST } = await import('@/app/api/motion/sync/route');

    const res = await POST(
      new Request('http://localhost/api/motion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: voiceReadyProject(),
          requestedAt: 984,
          updatedAt: 985,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'synced',
      syncPlan: {
        id: 'sync-plan-motion-aether-launch-draft-primary',
        status: 'ready',
        blockers: [],
      },
      project: {
        updatedAt: 985,
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-sync-plan',
            kind: 'sync',
            providerId: 'motion-sync',
            status: 'done',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'sync',
            label: 'Timeline sync',
            receiptLabels: expect.arrayContaining([
              'Beat markers',
              'Caption links',
              'Transition cues',
              'Sound cues',
            ]),
          }),
        ]),
      },
      previewPlan: {
        syncSummary: {
          status: 'ready',
        },
      },
    });

    const syncedTextClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-text');
    expect(syncedTextClip.props).toMatchObject({
      syncStatus: 'synced',
      syncPlanId: 'sync-plan-motion-aether-launch-draft-primary',
      syncMarkerId: 'sync-marker-beat-hook',
    });

    const syncedCaptionClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-caption');
    expect(syncedCaptionClip.props).toMatchObject({
      syncStatus: 'synced',
      captionLinkId: 'caption-link-clip-beat-hook-caption',
      timingSource: 'word-timings',
    });

    const syncedTransitionClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-transition-beat-hook-to-beat-problem');
    expect(syncedTransitionClip.props).toMatchObject({
      syncStatus: 'synced',
      transitionCueId: 'transition-cue-clip-transition-beat-hook-to-beat-problem',
    });
  });

  it('rejects malformed sync requests', async () => {
    const { POST } = await import('@/app/api/motion/sync/route');

    const missingProject = await POST(
      new Request('http://localhost/api/motion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedAt: 981,
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestedEngines: ['ffmpeg'],
        }),
      })
    );
    expect(badEngine.status).toBe(400);
    expect(await badEngine.json()).toMatchObject({
      ok: false,
      error: 'requestedEngines must contain remotion, hyperframes, or provider',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
