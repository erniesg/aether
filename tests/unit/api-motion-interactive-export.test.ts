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
      workflowMode: 'review',
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
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('POST /api/motion/interactive-export', () => {
  it('materializes an interactive manifest without completing the rendered export pack', async () => {
    const { POST } = await import('@/app/api/motion/interactive-export/route');

    const res = await POST(
      new Request('http://localhost/api/motion/interactive-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestedAt: 1200,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      interactiveExportPlan: {
        id: 'interactive-export-motion-aether-launch-draft-primary',
        status: 'ready',
        manifest: {
          id: 'interactive-export-motion-aether-launch-draft-primary-manifest',
          path: 'interactive-demos/motion-aether-launch/draft-primary/manifest.json',
          markerIds: expect.arrayContaining([
            'interactive-chapter-beat-demo',
            'interactive-hotspot-clip-beat-demo-text',
            'interactive-link-beat-cta',
          ]),
        },
        shareTarget: {
          id: 'interactive-share-motion-aether-launch-draft-primary',
          path: 'interactive-demos/motion-aether-launch/draft-primary/share.json',
        },
      },
      project: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-interactive-export-motion-aether-launch-draft-primary',
            kind: 'interactive-export',
            providerId: 'motion-interactive-export',
            outputRefs: [
              'interactive-export-motion-aether-launch-draft-primary-manifest',
              'interactive-share-motion-aether-launch-draft-primary',
            ],
            status: 'done',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-interactive-export-motion-aether-launch-draft-primary-1200',
            gateId: 'export',
            label: 'Interactive export',
            receiptLabels: [
              'Interactive manifest',
              'Interactive share metadata',
              'Interactive marker provenance',
            ],
          }),
        ]),
      },
      previewPlan: {
        interactiveDemo: {
          exportPlan: {
            status: 'ready',
            manifest: {
              path: 'interactive-demos/motion-aether-launch/draft-primary/manifest.json',
            },
          },
        },
        exportPackSummary: {
          status: 'needs-render',
        },
      },
    });
    expect(
      json.project.graphNodes.some((node: { kind: string }) => node.kind === 'export-pack')
    ).toBe(false);
  });

  it('rejects malformed interactive-export requests', async () => {
    const { POST } = await import('@/app/api/motion/interactive-export/route');

    const missingProject = await POST(
      new Request('http://localhost/api/motion/interactive-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedAt: 1201 }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/interactive-export', {
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
      new Request('http://localhost/api/motion/interactive-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
