import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

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

describe('POST /api/motion/full-auto', () => {
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
