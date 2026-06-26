import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { buildSiteMotionProjectFromUrl } from '@/lib/motion/siteMotion';
import { registerCaptureProvider } from '@/lib/providers/capture/registry';
import type {
  CaptureProvider,
  CaptureRequest,
  CaptureResult,
} from '@/lib/providers/capture/types';

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

async function siteProject(): Promise<MotionProject> {
  const fetcher = vi.fn<typeof fetch>(async () =>
    htmlResponse(`
      <main>
        <h1>Paillette Search</h1>
        <p>Paillette is an open-access art search app built with React and TypeScript.</p>
        <p>Search collections, inspect provenance, and export visual research boards.</p>
      </main>
    `)
  );

  return await buildSiteMotionProjectFromUrl(
    {
      id: 'motion-paillette-demo',
      workspaceId: 'demo-ws',
      siteUrl: 'paillette.app/search',
      siteLabel: 'Paillette Search',
      projectKind: 'demo',
      workflowMode: 'review',
      audience: 'curators',
      tone: 'precise',
      platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
      materializeTimeline: true,
      createdAt: 400,
    },
    { fetcher }
  );
}

function repoOnlyProject(): MotionProject {
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

function localAppProject(): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-tong-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'language learners',
      tone: 'textural',
      appProfile: {
        name: 'tong',
        repoUrl: '/Users/erniesg/code/erniesg/tong',
        summary: 'City-specific language learning app.',
        stack: ['TypeScript'],
      },
      sourceProfile: {
        kind: 'local-repo',
        label: 'tong source material',
        sourceRef: '/Users/erniesg/code/erniesg/tong',
        summary: 'local repo with 1 app route and 3 capture candidates',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-local-app-still',
            label: 'Capture local app route /',
            mode: 'screenshot',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: '/Users/erniesg/code/erniesg/tong',
            reason: 'Local repo exposes an app route suitable for a product still.',
            provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
          },
          {
            id: 'record-local-flow',
            label: 'Record local product flow /',
            mode: 'screen-recording',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: '/Users/erniesg/code/erniesg/tong',
            reason: 'Launch videos need a real product insert.',
            provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
          },
        ],
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
      },
      claims: [
        {
          text: 'tong local repo uses TypeScript across 12 source files.',
          source: { kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 82,
    }),
    { updatedAt: 83 }
  );
}

function provider(capture: CaptureProvider['capture']): CaptureProvider {
  return {
    id: 'browser-test',
    displayName: 'Browser test capture',
    available: () => true,
    capture,
  };
}

describe('POST /api/motion/capture', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns a provider-required capture handoff with requests and computer-use fallback', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          requestIds: ['capture-home-still', 'capture-dom-snapshot'],
          requestedAt: 900,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'provider-required',
      project: { id: 'motion-paillette-demo' },
      capturePlan: {
        status: 'ready',
        target: { kind: 'url', ref: 'https://paillette.app/search' },
        fallbacks: [
          {
            id: 'computer-use-capture',
            toolId: 'computer-use',
            permissionGate: {
              required: true,
              label: 'Creator approval required before desktop control',
            },
            outputContract: {
              applyRoute: '/api/motion/capture',
              artifactKinds: ['screenshot', 'recording', 'trace'],
            },
            expectedArtifacts: ['screenshot', 'recording', 'trace', 'redaction receipt'],
          },
        ],
      },
      selectedRequests: [
        { id: 'capture-home-still', request: { mode: 'screenshot' } },
        { id: 'capture-dom-snapshot', request: { mode: 'dom-snapshot' } },
      ],
      appLaunches: [],
      providers: [],
      captureResults: [],
      captureResult: null,
    });
    expect(json.blockers[0].id).toBe('capture-provider-required');
  });

  it('returns local app launch handoffs for local-app capture requests', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: localAppProject(),
          requestIds: ['capture-local-app-still', 'record-local-flow'],
          requestedAt: 904,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'provider-required',
      capturePlan: {
        status: 'ready',
        target: { kind: 'local-app', ref: 'http://localhost:3000/' },
        providerRequirements: ['browser-capture', 'app-launch', 'screen-recording'],
      },
      selectedRequests: [
        {
          id: 'capture-local-app-still',
          request: {
            mode: 'screenshot',
            appLaunch: {
              command: 'npm run dev',
              cwd: '/Users/erniesg/code/erniesg/tong',
              targetUrl: 'http://localhost:3000/',
            },
          },
        },
        {
          id: 'record-local-flow',
          request: {
            mode: 'screen-recording',
            appLaunch: {
              command: 'npm run dev',
              cwd: '/Users/erniesg/code/erniesg/tong',
              targetUrl: 'http://localhost:3000/',
            },
          },
        },
      ],
      appLaunches: [
        {
          command: 'npm run dev',
          cwd: '/Users/erniesg/code/erniesg/tong',
          targetUrl: 'http://localhost:3000/',
          readiness: { kind: 'http', url: 'http://localhost:3000/', timeoutMs: 60000 },
        },
      ],
      captureResults: [],
      captureResult: null,
    });
  });

  it('executes selected capture requests and applies visual receipts to the editable timeline', async () => {
    const capture = vi.fn(async (request: CaptureRequest): Promise<CaptureResult> => ({
      providerId: 'browser-test',
      artifacts: [
        {
          id: `artifact-${request.mode}`,
          kind: request.mode === 'dom-snapshot' ? 'snapshot' : 'screenshot',
          assetUrl:
            request.mode === 'dom-snapshot'
              ? 'asset://capture/dom.json'
              : 'asset://capture/home.png',
          width: request.mode === 'dom-snapshot' ? 1 : request.viewport.width,
          height: request.mode === 'dom-snapshot' ? 1 : request.viewport.height,
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
    unregister.push(registerCaptureProvider('browser-test', () => provider(capture)));

    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          providerId: 'browser-test',
          requestIds: ['capture-home-still', 'capture-dom-snapshot'],
          requestedAt: 901,
          updatedAt: 902,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'captured',
      project: {
        id: 'motion-paillette-demo',
        updatedAt: 902,
      },
      captureResult: {
        providerId: 'browser-test',
        artifacts: [{ id: 'artifact-screenshot' }, { id: 'artifact-dom-snapshot' }],
      },
      providers: [
        {
          id: 'browser-test',
          displayName: 'Browser test capture',
          available: true,
        },
      ],
    });
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls.map((call) => call[0].mode)).toEqual([
      'screenshot',
      'dom-snapshot',
    ]);

    const appFrameClip = json.project.tracks
      .flatMap((track: { clips: Array<{ componentId?: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      assetId: 'artifact-screenshot',
      props: {
        assetUrl: 'asset://capture/home.png',
        captureProviderId: 'browser-test',
        captureArtifactKind: 'screenshot',
      },
    });
    expect(json.project.graphNodes.find((node: { kind: string }) => node.kind === 'capture')).toMatchObject({
      status: 'done',
      providerId: 'browser-test',
      outputRefs: ['artifact-screenshot', 'artifact-dom-snapshot'],
    });
  });

  it('rejects computer-use capture without approval or redaction manifest', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');
    const missingApproval = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          requestIds: ['capture-home-still'],
          captureRunner: {
            kind: 'computer-use-local',
            redactionManifest: {
              labels: ['tokens'],
              applied: true,
              receiptRef: 'redactions.json',
            },
            receipts: [{ assetUrl: 'asset://capture/desktop.png' }],
          },
        }),
      })
    );

    expect(missingApproval.status).toBe(400);
    expect(await missingApproval.json()).toMatchObject({
      ok: false,
      error: 'computer-use capture requires creator approval',
    });

    const missingRedactions = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          requestIds: ['capture-home-still'],
          captureRunner: {
            kind: 'computer-use-local',
            approved: true,
            receipts: [{ assetUrl: 'asset://capture/desktop.png' }],
          },
        }),
      })
    );

    expect(missingRedactions.status).toBe(400);
    expect(await missingRedactions.json()).toMatchObject({
      ok: false,
      error: 'computer-use capture requires an applied redaction manifest',
    });
  });

  it('applies approved computer-use receipts through the capture route', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          requestIds: ['capture-home-still'],
          requestedAt: 905,
          updatedAt: 906,
          captureRunner: {
            kind: 'computer-use-local',
            approved: true,
            redactionManifest: {
              labels: ['tokens', 'emails'],
              applied: true,
              receiptRef: 'outputs/motion-captures/redactions.json',
            },
            receipts: [
              {
                assetUrl: 'asset://capture/paillette-desktop.png',
                width: 1080,
                height: 1920,
                mimeType: 'image/png',
                redactions: [
                  {
                    label: 'tokens',
                    target: 'browser toolbar',
                    action: 'mask',
                    applied: true,
                  },
                ],
              },
            ],
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'captured',
      captureRunner: {
        kind: 'computer-use-local',
        providerId: 'computer-use-capture',
        approved: true,
        redactionLabels: ['tokens', 'emails'],
      },
      captureResult: {
        providerId: 'computer-use-capture',
        artifacts: [
          {
            id: 'capture-computer-use-screenshot-https-paillette-app-search',
            assetUrl: 'asset://capture/paillette-desktop.png',
            redactions: [
              {
                label: 'tokens',
                target: 'browser toolbar',
                action: 'mask',
                applied: true,
              },
            ],
          },
        ],
      },
      providers: [
        {
          id: 'computer-use-capture',
          displayName: 'Computer-use capture',
          available: true,
        },
      ],
    });

    const appFrameClip = json.project.tracks
      .flatMap((track: { clips: Array<{ componentId?: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      assetId: 'capture-computer-use-screenshot-https-paillette-app-search',
      props: {
        assetUrl: 'asset://capture/paillette-desktop.png',
        captureProviderId: 'computer-use-capture',
        redactions: [
          {
            label: 'tokens',
            target: 'browser toolbar',
            action: 'mask',
            applied: true,
          },
        ],
      },
    });
  });

  it('returns source blockers before resolving capture providers', async () => {
    const capture = vi.fn(async (): Promise<CaptureResult> => ({
      providerId: 'browser-test',
      artifacts: [],
      provenance: [],
    }));
    unregister.push(registerCaptureProvider('browser-test', () => provider(capture)));

    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: repoOnlyProject(),
          providerId: 'browser-test',
          requestedAt: 903,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'blocked',
      capturePlan: {
        status: 'needs-source',
        fallbacks: [{ id: 'computer-use-capture' }],
      },
      selectedRequests: [],
      captureResult: null,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('rejects malformed capture requests', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds: ['capture-home-still'],
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const unknownRequest = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: await siteProject(),
          requestIds: ['missing-request'],
        }),
      })
    );
    expect(unknownRequest.status).toBe(400);
    expect(await unknownRequest.json()).toMatchObject({
      ok: false,
      error: 'requestIds must reference capture requests in the plan',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
