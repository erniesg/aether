import { describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import type { CaptureRequest } from '@/lib/providers/capture/types';

const captureMock = vi.hoisted(() => {
  const captureCalls: CaptureRequest[] = [];
  const createdOptions: Array<Record<string, unknown>> = [];
  const launchApp = vi.fn(async () => ({ close: vi.fn(async () => undefined) }));
  const createLocalAppLauncher = vi.fn(() => launchApp);

  return {
    captureCalls,
    createdOptions,
    launchApp,
    createLocalAppLauncher,
  };
});

vi.mock('@/lib/providers/capture/local-app-launch', () => ({
  createLocalAppLauncher: captureMock.createLocalAppLauncher,
}));

vi.mock('@/lib/providers/capture/playwright', () => ({
  createPlaywrightBrowserCaptureProvider: (options: Record<string, unknown>) => {
    captureMock.createdOptions.push(options);

    return {
      id: 'browser-capture',
      displayName: 'Playwright local capture',
      available: () => true,
      capture: async (request: CaptureRequest) => {
        captureMock.captureCalls.push(request);

        return {
          providerId: 'browser-capture',
          artifacts: [
            {
              id: `artifact-${request.mode}`,
              kind: request.mode === 'screen-recording' ? 'recording' : 'screenshot',
              assetUrl:
                request.mode === 'screen-recording'
                  ? 'file:///workspace/outputs/capture.webm'
                  : 'file:///workspace/outputs/capture.png',
              width: request.viewport.width,
              height: request.viewport.height,
              durationMs: request.mode === 'screen-recording' ? 3000 : undefined,
              mimeType: request.mode === 'screen-recording' ? 'video/webm' : 'image/png',
              viewport: request.viewport,
              cursorTargets: [],
              provenance: [{ kind: 'provider', ref: 'playwright-browser-runner' }],
            },
          ],
          provenance: [{ kind: 'provider', ref: 'browser-capture' }],
        };
      },
    };
  },
}));

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
        summary: 'local repo with a runnable app route',
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

describe('POST /api/motion/capture local runner', () => {
  it('uses an explicit Playwright local runner to capture local app receipts', async () => {
    const { POST } = await import('@/app/api/motion/capture/route');

    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: localAppProject(),
          requestIds: ['capture-local-app-still'],
          captureRunner: {
            kind: 'playwright-local',
            outputDir: 'outputs/motion-captures/tong-launch',
            launchLocalApp: true,
            headless: false,
            timeoutMs: 12000,
          },
          requestedAt: 910,
          updatedAt: 911,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'captured',
      project: {
        id: 'motion-tong-launch',
        updatedAt: 911,
      },
      captureRunner: {
        kind: 'playwright-local',
        providerId: 'browser-capture',
        launchLocalApp: true,
        headless: false,
        timeoutMs: 12000,
      },
      providers: [
        {
          id: 'browser-capture',
          displayName: 'Playwright local capture',
          available: true,
        },
      ],
      captureResult: {
        providerId: 'browser-capture',
        artifacts: [{ id: 'artifact-screenshot' }],
      },
    });
    expect(json.captureRunner.outputDir).toMatch(/outputs\/motion-captures\/tong-launch$/);
    expect(captureMock.createLocalAppLauncher).toHaveBeenCalledTimes(1);
    expect(captureMock.createdOptions).toHaveLength(1);
    expect(captureMock.createdOptions[0]).toMatchObject({
      headless: false,
      timeoutMs: 12000,
    });
    expect(captureMock.createdOptions[0].launchApp).toBe(captureMock.launchApp);
    expect(captureMock.captureCalls).toHaveLength(1);
    expect(captureMock.captureCalls[0].appLaunch).toMatchObject({
      command: 'npm run dev',
      cwd: '/Users/erniesg/code/erniesg/tong',
      targetUrl: 'http://localhost:3000/',
    });
  });
});
