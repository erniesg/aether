import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

function baseProject(): MotionProject {
  return buildRepoLaunchMotionProject({
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
  });
}

function project(): MotionProject {
  return materializeMotionTimeline(baseProject(), { updatedAt: 81 });
}

describe('POST /api/motion/preview-source', () => {
  it('returns a Remotion Player source package without requiring a render provider', async () => {
    const { POST } = await import('@/app/api/motion/preview-source/route');
    const res = await POST(
      new Request('http://localhost/api/motion/preview-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'remotion',
          requestedAt: 930,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      project: { id: 'motion-aether-launch' },
      previewSource: {
        engine: 'remotion',
        runtimeKind: 'remotion-player',
        label: 'Remotion Player',
        mountLabel: 'Mount Remotion Player',
        compositionId: 'motion-aether-launch-draft-primary',
        entryPoint: 'remotion/index.tsx',
        sourceHost: {
          apiRoute: '/api/motion/preview-source',
          entryPath: 'remotion/index.tsx',
          timelinePath: 'timeline/draft-primary.json',
        },
        runtimeHost: {
          status: 'source-ready',
          previewSurface: 'player',
          dependencyLabels: ['@remotion/player', 'remotion', '@remotion/media'],
          adapterRequirement:
            'aether Player adapter mounts timeline/draft-primary.json through @remotion/player.',
        },
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        enginePreviews: [
          {
            engine: 'remotion',
            runtimePreview: {
              kind: 'remotion-player',
              mountLabel: 'Mount Remotion Player',
            },
          },
        ],
      },
    });
    expect(json.previewSource.editLinkLabels).toEqual([
      'component props',
      'timeline JSON',
      'SCRIPT.md',
      'STORYBOARD.md',
    ]);
    expect(json.previewSource.sourceFiles.map((file: { path: string }) => file.path)).toEqual([
      'remotion/index.tsx',
      'DESIGN.md',
      'SCRIPT.md',
      'STORYBOARD.md',
      'timeline/draft-primary.json',
      'EDIT.md',
      'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
    ]);
    expect(json.previewSource.sourceFiles[0].contents).toContain('registerRoot(RemotionRoot)');
    expect(json.previewSource.sourceFiles[4].contents).toContain('"tracks"');
  });

  it('returns a HyperFrames iframe source package for the same motion project', async () => {
    const { POST } = await import('@/app/api/motion/preview-source/route');
    const res = await POST(
      new Request('http://localhost/api/motion/preview-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'hyperframes',
          requestedAt: 931,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      previewSource: {
        engine: 'hyperframes',
        runtimeKind: 'hyperframes-iframe',
        label: 'HyperFrames iframe',
        mountLabel: 'Mount HyperFrames iframe',
        entryPoint: 'index.html',
        sourceHost: {
          entryPath: 'index.html',
          timelinePath: 'timeline/draft-primary.json',
        },
        runtimeHost: {
          status: 'embedded-preview',
          previewSurface: 'iframe',
          dependencyLabels: ['HTML preview frame', 'GSAP timeline'],
          adapterRequirement: null,
        },
      },
    });
    expect(json.previewSource.editLinkLabels).toEqual([
      'data-start',
      'data-duration',
      'component classes',
      'SCRIPT.md',
      'STORYBOARD.md',
    ]);
    expect(json.previewSource.sourceFiles[0]).toMatchObject({
      kind: 'entry',
      path: 'index.html',
      mimeType: 'text/html',
    });
    expect(json.previewSource.sourceFiles[0].contents).toContain('data-composition-id');
  });

  it('returns timeline blockers before preparing preview source files', async () => {
    const { POST } = await import('@/app/api/motion/preview-source/route');
    const res = await POST(
      new Request('http://localhost/api/motion/preview-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: baseProject(),
          engine: 'remotion',
          requestedAt: 932,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'blocked',
      previewSource: null,
      plan: {
        status: 'needs-timeline',
        blockers: [{ id: 'timeline-required' }],
      },
    });
  });

  it('rejects malformed preview-source requests', async () => {
    const { POST } = await import('@/app/api/motion/preview-source/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/preview-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'remotion',
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const invalidEngine = await POST(
      new Request('http://localhost/api/motion/preview-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'provider',
        }),
      })
    );
    expect(invalidEngine.status).toBe(400);
    expect(await invalidEngine.json()).toMatchObject({
      ok: false,
      error: 'engine must be remotion or hyperframes',
    });
  });
});
