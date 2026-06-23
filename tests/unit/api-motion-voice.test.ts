import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
import type {
  VoiceProvider,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';

function baseProject(): MotionProject {
  return buildRepoLaunchMotionProject({
    id: 'motion-aether-launch',
    workspaceId: 'demo-ws',
    projectKind: 'launch',
    workflowMode: 'review',
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
  });
}

function project(): MotionProject {
  return materializeMotionTimeline(baseProject(), { updatedAt: 12 });
}

function provider(synthesize: VoiceProvider['synthesize']): VoiceProvider {
  return {
    id: 'voice-test',
    displayName: 'Voice test synthesis',
    available: () => true,
    synthesize,
  };
}

function resultFor(request: VoiceSynthesisRequest): VoiceSynthesisResult {
  return {
    providerId: 'voice-test',
    artifacts: request.expectedArtifacts.map((artifact) => ({
      ...artifact,
      assetUrl: `asset://${artifact.path}`,
      ...(artifact.kind === 'audio' ? { durationMs: request.durationFrames * 30 } : {}),
      provenance: [
        { kind: 'provider', ref: 'voice-test' },
        ...artifact.provenance,
      ],
    })),
    provenance: [{ kind: 'provider', ref: 'voice-test' }],
  };
}

describe('POST /api/motion/voice', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns provider-required voice handoffs with timing and expected artifacts', async () => {
    const { POST } = await import('@/app/api/motion/voice/route');
    const res = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestIds: ['voice-clip-beat-hook-voice'],
          voiceId: 'calm-launch-narrator',
          requestedAt: 900,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'provider-required',
      project: { id: 'motion-aether-launch' },
      voicePlan: {
        status: 'ready',
        providerRequirements: ['voice-synthesis', 'word-timing-alignment'],
      },
      selectedRequests: [
        {
          id: 'voice-clip-beat-hook-voice',
          clipId: 'clip-beat-hook-voice',
          targetSeconds: 3,
          voiceId: 'calm-launch-narrator',
          expectedArtifacts: [
            { kind: 'audio' },
            { kind: 'word-timings' },
            { kind: 'transcript' },
          ],
        },
      ],
      providers: [],
      voiceResults: [],
    });
    expect(json.blockers[0].id).toBe('voice-provider-required');
  });

  it('executes a configured provider and applies audio, word timings, and transcript receipts', async () => {
    const synthesize = vi.fn(async (request: VoiceSynthesisRequest) => resultFor(request));
    unregister.push(registerVoiceProvider('voice-test', () => provider(synthesize)));

    const { POST } = await import('@/app/api/motion/voice/route');
    const res = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          providerId: 'voice-test',
          clipIds: ['clip-beat-hook-voice'],
          voiceId: 'calm-launch-narrator',
          requestedAt: 901,
          updatedAt: 902,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'synthesized',
      project: {
        id: 'motion-aether-launch',
        updatedAt: 902,
      },
      selectedRequests: [{ clipId: 'clip-beat-hook-voice' }],
      voiceResults: [{ providerId: 'voice-test' }],
      providers: [
        {
          id: 'voice-test',
          displayName: 'Voice test synthesis',
          available: true,
        },
      ],
    });
    expect(synthesize).toHaveBeenCalledTimes(1);

    const voiceClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-voice');
    expect(voiceClip).toMatchObject({
      assetId: 'voice-clip-beat-hook-voice-audio',
      props: {
        status: 'ready',
        voiceProviderId: 'voice-test',
        audioAssetId: 'voice-clip-beat-hook-voice-audio',
        wordTimingsAssetId: 'voice-clip-beat-hook-voice-word-timings',
        transcriptAssetId: 'voice-clip-beat-hook-voice-transcript',
      },
    });

    const captionClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-caption');
    expect(captionClip.props).toMatchObject({
      voiceClipId: 'clip-beat-hook-voice',
      wordTimingsAssetId: 'voice-clip-beat-hook-voice-word-timings',
      transcriptAssetId: 'voice-clip-beat-hook-voice-transcript',
    });

    expect(json.project.graphNodes.find((node: { id: string }) => node.id === 'node-voice-plan')).toMatchObject({
      kind: 'voice',
      status: 'done',
      providerId: 'voice-test',
      inputRefs: ['clip-beat-hook-voice'],
    });
  });

  it('returns timeline blockers before resolving providers', async () => {
    const synthesize = vi.fn(async (request: VoiceSynthesisRequest) => resultFor(request));
    unregister.push(registerVoiceProvider('voice-test', () => provider(synthesize)));

    const { POST } = await import('@/app/api/motion/voice/route');
    const res = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: baseProject(),
          providerId: 'voice-test',
          requestedAt: 903,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'blocked',
      voicePlan: {
        status: 'needs-timeline',
        blockers: [{ id: 'voice-track-required' }],
      },
      selectedRequests: [],
      voiceResults: [],
    });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('rejects malformed voice requests', async () => {
    const { POST } = await import('@/app/api/motion/voice/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds: ['voice-clip-beat-hook-voice'],
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const unknownRequest = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestIds: ['missing-request'],
        }),
      })
    );
    expect(unknownRequest.status).toBe(400);
    expect(await unknownRequest.json()).toMatchObject({
      ok: false,
      error: 'requestIds or clipIds must reference voice requests in the plan',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
