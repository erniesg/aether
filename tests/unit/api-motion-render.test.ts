import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { resetConfiguredMotionRenderProvidersForTests } from '@/lib/providers/video/configured-render';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import type {
  MotionRenderProvider,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';

const RENDER_ENV_KEYS = [
  'AETHER_MOTION_RENDER_PROJECT_DIR',
  'AETHER_REMOTION_RENDER_PROJECT_DIR',
  'AETHER_HYPERFRAMES_RENDER_PROJECT_DIR',
] as const;
const ORIGINAL_RENDER_ENV = Object.fromEntries(
  RENDER_ENV_KEYS.map((key) => [key, process.env[key]])
);

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
    resetConfiguredMotionRenderProvidersForTests();
    restoreRenderEnv();
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
      'EDIT.md',
      'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
    ]);
  });

  it('keeps render handoff source parity identical across Remotion and HyperFrames', async () => {
    const { POST } = await import('@/app/api/motion/render/route');
    const remotionRes = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'remotion',
          requestedAt: 905,
        }),
      })
    );
    const hyperframesRes = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          engine: 'hyperframes',
          requestedAt: 905,
        }),
      })
    );

    expect(remotionRes.status).toBe(200);
    expect(hyperframesRes.status).toBe(200);
    const remotionJson = await remotionRes.json();
    const hyperframesJson = await hyperframesRes.json();
    const remotionManifest = sourceManifestFromRenderRequest(remotionJson.request);
    const hyperframesManifest = sourceManifestFromRenderRequest(hyperframesJson.request);

    expect(remotionJson.status).toBe('provider-required');
    expect(hyperframesJson.status).toBe('provider-required');
    expect(remotionManifest.sourceParity).toEqual(hyperframesManifest.sourceParity);
    expect(remotionManifest.sourceParity.sourceManifestConcept).toBe('editable-motion-source');
    expect(remotionManifest.sourceParity.renderProofExpectations.proofArtifactLabels).toEqual([
      'MP4',
      'Poster',
      'Subtitles',
      'Transcript',
      'Manifest',
    ]);
    expect(remotionManifest.engineEntryFile).toMatchObject({
      engine: 'remotion',
      path: 'remotion/index.tsx',
    });
    expect(hyperframesManifest.engineEntryFile).toMatchObject({
      engine: 'hyperframes',
      path: 'index.html',
    });
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
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-render-package-remotion-test-render-plan-motion-aether-launch-draft-primary-remotion-902',
            gateId: 'render',
            label: 'Render package verification',
            receiptLabels: expect.arrayContaining([
              'Render source manifest',
              'Render one-frame layout check',
              'MP4 artifact check',
            ]),
          }),
        ]),
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
          { path: 'EDIT.md' },
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

  it('lists env-configured local render providers before renderer execution', async () => {
    process.env.AETHER_REMOTION_RENDER_PROJECT_DIR = '/tmp/aether-remotion-render';

    const { POST } = await import('@/app/api/motion/render/route');
    const res = await POST(
      new Request('http://localhost/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: baseProject(),
          engine: 'remotion',
          requestedAt: 904,
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
      providers: [
        {
          id: 'remotion-local',
          engine: 'remotion',
          displayName: 'Remotion local render',
          available: true,
        },
      ],
    });
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

function restoreRenderEnv(): void {
  for (const key of RENDER_ENV_KEYS) {
    const original = ORIGINAL_RENDER_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

function sourceManifestFromRenderRequest(request: {
  sourceFiles: Array<{ kind: string; contents: string }>;
}) {
  const manifest = request.sourceFiles.find((file) => file.kind === 'manifest');
  return JSON.parse(manifest?.contents ?? '{}');
}
