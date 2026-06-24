import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { registerCaptureProvider } from '@/lib/providers/capture/registry';
import type {
  CaptureProvider,
  CaptureRequest,
  CaptureResult,
} from '@/lib/providers/capture/types';

function project(): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'full-auto',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      sourceProfile: {
        kind: 'github-repo',
        label: 'aether source material',
        sourceRef: 'https://github.com/erniesg/aether',
        summary: 'GitHub repo with hosted capture candidates',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-hosted-still',
            label: 'Capture aether homepage',
            mode: 'screenshot',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Hosted site is available as product evidence.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
        ],
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 120,
    }),
    { updatedAt: 121 }
  );
}

function captureProvider(capture: CaptureProvider['capture']): CaptureProvider {
  return {
    id: 'browser-test',
    displayName: 'Browser test capture',
    available: () => true,
    capture,
  };
}

describe('POST /api/motion/full-auto', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns a saved full-auto pause with production, review, and preview plans', async () => {
    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestedAt: 700,
          requestedEngines: ['hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'paused',
      run: {
        id: 'full-auto-motion-aether-launch-draft-primary-700',
        status: 'paused',
        reason: 'provider-required',
        stepId: 'capture',
        advancedStepIds: [],
        providerRequirementLabels: ['browser capture'],
        apiRoutes: ['/api/motion/capture'],
        toolIds: ['motion-capture'],
      },
      project: {
        id: 'motion-aether-launch',
      },
      productionPlan: {
        projectId: 'motion-aether-launch',
        mode: 'full-auto',
        nextStepId: 'capture',
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
        workflowMode: 'full-auto',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        productionPlan: {
          nextStepId: 'capture',
        },
        enginePreviews: [{ engine: 'hyperframes', status: 'ready' }],
      },
    });
  });

  it('executes configured capture providers before pausing at the next provider gate', async () => {
    const capture = vi.fn(async (request: CaptureRequest): Promise<CaptureResult> => ({
      providerId: 'browser-test',
      artifacts: [
        {
          id: `full-auto-${request.mode}`,
          kind: request.mode === 'dom-snapshot' ? 'snapshot' : 'screenshot',
          assetUrl: `asset://full-auto/${request.mode}.png`,
          width: request.viewport.width,
          height: request.viewport.height,
          mimeType: request.mode === 'dom-snapshot' ? 'application/json' : 'image/png',
          viewport: request.viewport,
          cursorTargets: [{ stepId: 'goto-source', x: 540, y: 960 }],
          provenance: [
            { kind: 'provider', ref: 'browser-test' },
            { kind: 'site', ref: request.target.ref },
          ],
        },
      ],
      provenance: [
        { kind: 'provider', ref: 'browser-test' },
        { kind: 'site', ref: request.target.ref },
      ],
    }));
    unregister.push(registerCaptureProvider('browser-test', () => captureProvider(capture)));

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          captureProviderId: 'browser-test',
          requestedAt: 702,
          updatedAt: 703,
          requestedEngines: ['hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'paused',
      run: {
        status: 'paused',
        reason: 'provider-required',
        stepId: 'visual-source',
        advancedStepIds: ['capture'],
        receiptCount: 1,
      },
      project: {
        id: 'motion-aether-launch',
        executionHistory: [
          {
            id: 'execution-capture-browser-test-703',
            gateId: 'capture',
            receiptCount: 1,
            receiptLabels: ['Screenshot'],
          },
        ],
      },
      productionPlan: {
        nextStepId: 'visual-source',
      },
      previewPlan: {
        productionPlan: {
          nextStepId: 'visual-source',
        },
      },
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toMatchObject({
      mode: 'screenshot',
      preferredProviderId: 'browser-test',
    });
  });

  it('rejects malformed full-auto requests', async () => {
    const { POST } = await import('@/app/api/motion/full-auto/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedAt: 701,
        }),
      })
    );

    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/full-auto', {
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
  });
});
