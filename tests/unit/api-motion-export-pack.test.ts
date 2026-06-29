import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import type { MotionRenderResult } from '@/lib/providers/video/types';
import { applyMotionRenderResultToMotionProject } from '@/lib/motion/renderApply';
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

function renderResult(): MotionRenderResult {
  const exportId = 'export-x-9x16';
  const output = (
    kind: MotionRenderResult['outputs'][number]['kind'],
    extension: string
  ): MotionRenderResult['outputs'][number] => ({
    id: `render-${exportId}-${kind}`,
    exportId,
    kind,
    platform: 'x',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    mimeType: kind === 'video' ? 'video/mp4' : 'application/octet-stream',
    path: `renders/motion-aether-launch/${exportId}/${kind}.${extension}`,
    assetUrl: `asset://renders/${exportId}/${kind}.${extension}`,
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  });

  return {
    providerId: 'remotion-local',
    engine: 'remotion',
    outputs: [
      output('video', 'mp4'),
      output('poster', 'png'),
      output('subtitle', 'vtt'),
      output('transcript', 'txt'),
      output('manifest', 'json'),
    ],
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  };
}

describe('POST /api/motion/export-pack', () => {
  it('returns a render blocker before every export artifact is ready', async () => {
    const { POST } = await import('@/app/api/motion/export-pack/route');

    const res = await POST(
      new Request('http://localhost/api/motion/export-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          requestedAt: 1000,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      exportPackPlan: {
        id: 'export-pack-motion-aether-launch-draft-primary',
        status: 'needs-render',
        readyCount: 0,
        totalCount: 1,
        manifest: null,
        blockers: [{ id: 'render-required' }],
        items: [
          {
            exportId: 'export-x-9x16',
            missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
            canvasDrop: null,
          },
        ],
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
      },
    });
  });

  it('returns a ready pack manifest and canvas drop candidates after render', async () => {
    const renderedProject = applyMotionRenderResultToMotionProject(
      project(),
      renderResult(),
      { updatedAt: 1001 }
    );
    const { POST } = await import('@/app/api/motion/export-pack/route');

    const res = await POST(
      new Request('http://localhost/api/motion/export-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: renderedProject,
          requestedAt: 1002,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      project: {
        id: 'motion-aether-launch',
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-export-pack-motion-aether-launch-draft-primary',
            kind: 'export-pack',
            status: 'done',
            outputRefs: ['export-pack-motion-aether-launch-draft-primary-manifest'],
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-export-pack-motion-aether-launch-draft-primary-1002',
            gateId: 'export',
            label: 'Export pack',
            receiptLabels: ['Export pack manifest', 'Canvas drop candidates', 'Pack provenance'],
          }),
        ]),
      },
      exportPackPlan: {
        status: 'ready',
        readyCount: 1,
        totalCount: 1,
        blockers: [],
        manifest: {
          id: 'export-pack-motion-aether-launch-draft-primary-manifest',
          path: 'export-packs/motion-aether-launch/draft-primary/manifest.json',
        },
        items: [
          {
            exportId: 'export-x-9x16',
            status: 'ready',
            videoAssetId: 'render-export-x-9x16-video',
            posterAssetId: 'render-export-x-9x16-poster',
            canvasDrop: {
              kind: 'video',
              assetId: 'render-export-x-9x16-video',
              posterAssetId: 'render-export-x-9x16-poster',
            },
          },
        ],
      },
      previewPlan: {
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
    });
  });

  it('rejects malformed export-pack requests', async () => {
    const { POST } = await import('@/app/api/motion/export-pack/route');

    const missingProject = await POST(
      new Request('http://localhost/api/motion/export-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedAt: 1003 }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/export-pack', {
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
      new Request('http://localhost/api/motion/export-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
