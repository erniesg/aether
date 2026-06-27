import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import type { MotionProject } from '@/lib/motion/project';
import { applyCaptureResultToMotionProject } from '@/lib/motion/captureApply';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
} from '@/lib/providers/video/types';

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

function timelineProject(): MotionProject {
  return materializeMotionTimeline(baseProject(), { updatedAt: 12 });
}

const screenshotCaptureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-screenshot-aether-localhost',
      kind: 'screenshot',
      assetUrl: 'asset://capture/aether-home.png',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      cursorTargets: [],
      provenance: [
        { kind: 'provider', ref: 'browser-capture' },
        { kind: 'site', ref: 'http://localhost:3000' },
      ],
    },
  ],
  provenance: [
    { kind: 'provider', ref: 'browser-capture' },
    { kind: 'site', ref: 'http://localhost:3000' },
  ],
};

function projectWithVisualSource(): MotionProject {
  return applyCaptureResultToMotionProject(timelineProject(), screenshotCaptureResult, {
    updatedAt: 20,
  });
}

function provider(generate: MotionImageToVideoProvider['generate']): MotionImageToVideoProvider {
  return {
    id: 'image-video-test',
    displayName: 'Image video test generation',
    available: () => true,
    generate,
  };
}

function resultFor(request: MotionImageToVideoRequest): MotionImageToVideoResult {
  return {
    providerId: 'image-video-test',
    artifacts: [
      {
        ...request.output,
        requestId: request.id,
        assetUrl: `asset://${request.output.path}`,
        durationMs: 8000,
        provenance: [
          { kind: 'provider', ref: 'image-video-test' },
          ...request.output.provenance,
        ],
      },
    ],
    provenance: [{ kind: 'provider', ref: 'image-video-test' }],
  };
}

describe('POST /api/motion/image-to-video', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns provider-required generation handoffs with source asset and prompt', async () => {
    const { POST } = await import('@/app/api/motion/image-to-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithVisualSource(),
          clipIds: ['clip-beat-demo-text'],
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
      imageToVideoPlan: {
        status: 'ready',
        providerRequirements: ['image-to-video'],
      },
      selectedRequests: [
        {
          id: 'image-to-video-clip-beat-demo-text',
          clipId: 'clip-beat-demo-text',
          sourceAssetId: 'capture-screenshot-aether-localhost',
          source: {
            assetId: 'capture-screenshot-aether-localhost',
            assetUrl: 'asset://capture/aether-home.png',
            kind: 'screenshot',
            mimeType: 'image/png',
            providerId: 'browser-capture',
          },
          output: {
            id: 'generated-clip-beat-demo-text-image-to-video',
            mimeType: 'video/mp4',
          },
        },
      ],
      providers: [],
      generationResults: [],
      generationResult: null,
    });
    expect(json.selectedRequests[0].prompt).toContain('Keep existing UI text crisp');
    expect(json.blockers[0].id).toBe('image-to-video-provider-required');
  });

  it('executes a configured provider and applies generated clip receipts to the timeline', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => resultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () => provider(generate))
    );

    const { POST } = await import('@/app/api/motion/image-to-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithVisualSource(),
          providerId: 'image-video-test',
          requestIds: ['image-to-video-clip-beat-demo-text'],
          requestedAt: 901,
          updatedAt: 902,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'generated',
      project: {
        id: 'motion-aether-launch',
        updatedAt: 902,
      },
      generationResult: {
        providerId: 'image-video-test',
        artifacts: [
          {
            id: 'generated-clip-beat-demo-text-image-to-video',
            sourceAssetId: 'capture-screenshot-aether-localhost',
          },
        ],
      },
      providers: [
        {
          id: 'image-video-test',
          displayName: 'Image video test generation',
          available: true,
        },
      ],
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          assetId: 'capture-screenshot-aether-localhost',
          assetUrl: 'asset://capture/aether-home.png',
          kind: 'screenshot',
          mimeType: 'image/png',
          providerId: 'browser-capture',
        }),
      })
    );

    const generatedClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-demo-text');
    expect(generatedClip).toMatchObject({
      assetId: 'generated-clip-beat-demo-text-image-to-video',
      props: {
        assetUrl: 'asset://generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
        generatedVideoAssetId: 'generated-clip-beat-demo-text-image-to-video',
        imageToVideoProviderId: 'image-video-test',
        sourceVisualAssetId: 'capture-screenshot-aether-localhost',
        status: 'ready',
      },
    });

    expect(
      json.project.graphNodes.find(
        (node: { id: string }) => node.id === 'node-image-to-video-plan'
      )
    ).toMatchObject({
      kind: 'image-to-video',
      status: 'done',
      providerId: 'image-video-test',
      inputRefs: ['clip-beat-demo-text', 'capture-screenshot-aether-localhost'],
      outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    });
  });

  it('stages generated clips for creator review when requested', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => resultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () => provider(generate))
    );

    const { POST } = await import('@/app/api/motion/image-to-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithVisualSource(),
          providerId: 'image-video-test',
          applyMode: 'stage',
          requestIds: ['image-to-video-clip-beat-demo-text'],
          requestedAt: 905,
          updatedAt: 906,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'generated-for-review',
      project: {
        id: 'motion-aether-launch',
        updatedAt: 906,
      },
    });

    const generatedClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-demo-text');
    expect(generatedClip.assetId).toBe('capture-screenshot-aether-localhost');
    expect(generatedClip.props).toMatchObject({
      generatedVideoTakes: [
        {
          id: 'generated-clip-beat-demo-text-image-to-video',
          assetId: 'generated-clip-beat-demo-text-image-to-video',
          assetUrl: 'asset://generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
          providerId: 'image-video-test',
          requestId: 'image-to-video-clip-beat-demo-text',
          sourceAssetId: 'capture-screenshot-aether-localhost',
          sourceVisualAssetId: 'capture-screenshot-aether-localhost',
          mimeType: 'video/mp4',
          status: 'ready',
        },
      ],
    });
    expect(json.previewPlan.visualGenerationSummary.nodePlan.nextNodeId).toBe(
      'review-generated-clips'
    );
  });

  it('returns visual-source blockers before resolving providers', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => resultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () => provider(generate))
    );

    const { POST } = await import('@/app/api/motion/image-to-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: timelineProject(),
          providerId: 'image-video-test',
          requestedAt: 903,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'blocked',
      imageToVideoPlan: {
        status: 'needs-visual-source',
        blockers: [{ id: 'visual-source-required' }],
      },
      selectedRequests: [],
      generationResult: null,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects malformed generation requests', async () => {
    const { POST } = await import('@/app/api/motion/image-to-video/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds: ['image-to-video-clip-beat-demo-text'],
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const unknownRequest = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithVisualSource(),
          requestIds: ['missing-request'],
        }),
      })
    );
    expect(unknownRequest.status).toBe(400);
    expect(await unknownRequest.json()).toMatchObject({
      ok: false,
      error: 'requestIds or clipIds must reference image-to-video requests in the plan',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/image-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
