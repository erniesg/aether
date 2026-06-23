import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import type {
  MotionRenderProvider,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';

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

function provider(render: MotionRenderProvider['render']): MotionRenderProvider {
  return {
    id: 'remotion-test',
    engine: 'remotion',
    displayName: 'Remotion test render',
    available: () => true,
    render,
  };
}

describe('POST /api/motion/render', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns a provider-required render handoff when no renderer is configured', async () => {
    const { POST } = await import('@/app/api/motion/render/route');
    const res = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'remotion',
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
      plan: {
        id: 'render-plan-motion-aether-launch-draft-primary-remotion',
        status: 'ready',
        engine: 'remotion',
      },
      request: {
        engine: 'remotion',
        compositionId: 'motion-aether-launch-draft-primary',
        durationFrames: 900,
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        enginePreviews: [{ engine: 'remotion', status: 'ready' }],
      },
      providers: [],
      renderResult: null,
    });
    expect(json.blockers[0].id).toBe('render-provider-required');
    expect(json.request.outputs.map((output: { kind: string }) => output.kind)).toEqual([
      'video',
      'poster',
      'subtitle',
      'transcript',
      'manifest',
    ]);
    expect(json.request.sourceFiles.map((file: { path: string }) => file.path)).toEqual([
      'remotion/index.tsx',
      'DESIGN.md',
      'SCRIPT.md',
      'STORYBOARD.md',
      'timeline/draft-primary.json',
      'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
    ]);
  });

  it('executes a configured render provider and returns updated exports', async () => {
    const render = vi.fn(async (request: MotionRenderRequest): Promise<MotionRenderResult> => ({
      providerId: 'remotion-test',
      engine: 'remotion',
      outputs: request.outputs.map((output) => ({
        ...output,
        assetUrl: `asset://${output.path}`,
      })),
      provenance: [{ kind: 'provider', ref: 'remotion-test' }],
    }));
    unregister.push(registerMotionRenderProvider('remotion-test', () => provider(render)));

    const { POST } = await import('@/app/api/motion/render/route');
    const res = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'remotion',
          providerId: 'remotion-test',
          requestedAt: 901,
          updatedAt: 902,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'rendered',
      project: {
        id: 'motion-aether-launch',
        updatedAt: 902,
        exports: [
          {
            id: 'export-x-9x16',
            status: 'ready',
            assetId: 'render-export-x-9x16-video',
            posterAssetId: 'render-export-x-9x16-poster',
          },
        ],
      },
      renderResult: {
        providerId: 'remotion-test',
        engine: 'remotion',
      },
      request: {
        engine: 'remotion',
        sourceFiles: [
          { path: 'remotion/index.tsx' },
          { path: 'DESIGN.md' },
          { path: 'SCRIPT.md' },
          { path: 'STORYBOARD.md' },
          { path: 'timeline/draft-primary.json' },
          {
            path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
          },
        ],
      },
      providers: [
        {
          id: 'remotion-test',
          engine: 'remotion',
          displayName: 'Remotion test render',
          available: true,
        },
      ],
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('returns timeline blockers before resolving a provider when the project has no timeline', async () => {
    const render = vi.fn(async (request: MotionRenderRequest): Promise<MotionRenderResult> => ({
      providerId: 'remotion-test',
      engine: 'remotion',
      outputs: request.outputs.map((output) => ({
        ...output,
        assetUrl: `asset://${output.path}`,
      })),
      provenance: [],
    }));
    unregister.push(registerMotionRenderProvider('remotion-test', () => provider(render)));

    const { POST } = await import('@/app/api/motion/render/route');
    const res = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: baseProject(),
          engine: 'remotion',
          providerId: 'remotion-test',
          requestedAt: 903,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'blocked',
      plan: {
        status: 'needs-timeline',
        blockers: [{ id: 'timeline-required' }],
      },
      request: null,
      renderResult: null,
    });
    expect(render).not.toHaveBeenCalled();
  });

  it('rejects malformed render requests', async () => {
    const { POST } = await import('@/app/api/motion/render/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/render', {
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
      new Request('http://localhost/api/motion/render', {
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

    const badJson = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
