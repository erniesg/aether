import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCaptureResultToMotionProject } from '@/lib/motion/captureApply';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { registerCaptureProvider } from '@/lib/providers/capture/registry';
import type {
  CaptureProvider,
  CaptureRequest,
  CaptureResult,
} from '@/lib/providers/capture/types';
import { resetConfiguredMotionRenderProvidersForTests } from '@/lib/providers/video/configured-render';
import { resetConfiguredMotionImageToVideoProvidersForTests } from '@/lib/providers/video/configured-generation';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
import { resetConfiguredVoiceProvidersForTests } from '@/lib/providers/voice/configured';
import type {
  VoiceProvider,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
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

const VOICE_ENV_KEYS = [
  'AETHER_VOICE_SYNTHESIS_PROJECT_DIR',
  'AETHER_VOICE_SYNTHESIS_COMMAND',
  'AETHER_VOICE_SYNTHESIS_ARGS',
] as const;
const ORIGINAL_VOICE_ENV = Object.fromEntries(
  VOICE_ENV_KEYS.map((key) => [key, process.env[key]])
);

const IMAGE_TO_VIDEO_ENV_KEYS = [
  'AETHER_IMAGE_TO_VIDEO_PROJECT_DIR',
  'AETHER_IMAGE_TO_VIDEO_COMMAND',
  'AETHER_IMAGE_TO_VIDEO_ARGS',
] as const;
const ORIGINAL_IMAGE_TO_VIDEO_ENV = Object.fromEntries(
  IMAGE_TO_VIDEO_ENV_KEYS.map((key) => [key, process.env[key]])
);

const captureRunnerMock = vi.hoisted(() => {
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
  createLocalAppLauncher: captureRunnerMock.createLocalAppLauncher,
}));

vi.mock('@/lib/providers/capture/playwright', () => ({
  createPlaywrightBrowserCaptureProvider: (options: Record<string, unknown>) => {
    captureRunnerMock.createdOptions.push(options);

    return {
      id: 'browser-capture',
      displayName: 'Playwright local capture',
      available: () => true,
      capture: async (request: CaptureRequest): Promise<CaptureResult> => {
        captureRunnerMock.captureCalls.push(request);

        return {
          providerId: 'browser-capture',
          artifacts: [
            {
              id: `full-auto-${request.mode}`,
              kind: request.mode === 'screen-recording' ? 'recording' : 'screenshot',
              assetUrl:
                request.mode === 'screen-recording'
                  ? 'file:///workspace/outputs/full-auto-capture.webm'
                  : 'file:///workspace/outputs/full-auto-capture.png',
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

function localAppProject(): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-tong-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'full-auto',
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

const screenshotCaptureResult: CaptureResult = {
  providerId: 'browser-test',
  artifacts: [
    {
      id: 'capture-aether-homepage',
      kind: 'screenshot',
      assetUrl: 'asset://captures/aether-homepage.png',
      mimeType: 'image/png',
      width: 1080,
      height: 1920,
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      cursorTargets: [],
      provenance: [
        { kind: 'provider', ref: 'browser-test' },
        { kind: 'site', ref: 'https://aether.example' },
      ],
    },
  ],
  provenance: [
    { kind: 'provider', ref: 'browser-test' },
    { kind: 'site', ref: 'https://aether.example' },
  ],
};

function projectWithSelectedVisualSource(): MotionProject {
  const captured = applyCaptureResultToMotionProject(project(), screenshotCaptureResult, {
    updatedAt: 710,
  });

  return {
    ...captured,
    graphNodes: [
      ...captured.graphNodes,
      {
        id: 'node-visual-sourcing-plan',
        kind: 'visual-search',
        inputRefs: ['capture-aether-homepage'],
        outputRefs: ['visual-source-capture-assets'],
        providerId: 'asset-selection',
        status: 'done',
        provenance: [{ kind: 'capture', ref: 'capture-aether-homepage' }],
      },
    ],
  };
}

function imageToVideoProvider(
  generate: MotionImageToVideoProvider['generate']
): MotionImageToVideoProvider {
  return {
    id: 'image-video-test',
    displayName: 'Image video test generation',
    available: () => true,
    generate,
  };
}

function generatedClipFor(request: MotionImageToVideoRequest): MotionImageToVideoResult {
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

function voiceProvider(synthesize: VoiceProvider['synthesize']): VoiceProvider {
  return {
    id: 'voice-test',
    displayName: 'Voice test synthesis',
    available: () => true,
    synthesize,
  };
}

function voiceResultFor(request: VoiceSynthesisRequest): VoiceSynthesisResult {
  return {
    providerId: 'voice-test',
    artifacts: request.expectedArtifacts.map((artifact) => ({
      ...artifact,
      assetUrl: `asset://${artifact.path}`,
      ...(artifact.kind === 'audio' ? { durationMs: request.durationFrames * 30 } : {}),
      provenance: [
        { kind: 'provider', ref: 'voice-test' },
        ...artifact.provenance,
      ],
    })),
    provenance: [{ kind: 'provider', ref: 'voice-test' }],
  };
}

function renderProvider(render: MotionRenderProvider['render']): MotionRenderProvider {
  return {
    id: 'remotion-test',
    engine: 'remotion',
    displayName: 'Remotion test render',
    available: () => true,
    render,
  };
}

function renderResultFor(request: MotionRenderRequest): MotionRenderResult {
  return {
    providerId: 'remotion-test',
    engine: 'remotion',
    outputs: request.outputs.map((output) => ({
      ...output,
      assetUrl: `asset://${output.path}`,
      provenance: [
        { kind: 'provider', ref: 'remotion-test' },
        ...output.provenance,
      ],
    })),
    provenance: [{ kind: 'provider', ref: 'remotion-test' }],
  };
}

describe('POST /api/motion/full-auto', () => {
  const unregister: Array<() => void> = [];

  beforeEach(() => {
    clearVoiceEnv();
    clearImageToVideoEnv();
  });

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
    resetConfiguredMotionRenderProvidersForTests();
    resetConfiguredVoiceProvidersForTests();
    resetConfiguredMotionImageToVideoProvidersForTests();
    restoreRenderEnv();
    restoreVoiceEnv();
    restoreImageToVideoEnv();
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

  it('executes capture providers and auto-selects captured visual sources', async () => {
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
        stepId: 'visual-generation',
        advancedStepIds: ['capture', 'visual-source'],
        receiptCount: 2,
      },
      project: {
        id: 'motion-aether-launch',
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-visual-sourcing-plan',
            kind: 'visual-search',
            outputRefs: ['full-auto-screenshot'],
            providerId: 'asset-selection',
            status: 'done',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-capture-browser-test-703',
            gateId: 'capture',
            receiptCount: 1,
            receiptLabels: ['Screenshot'],
          }),
          expect.objectContaining({
            id: 'execution-visual-source-asset-selection-703',
            gateId: 'visual-source',
            receiptCount: 1,
            receiptLabels: ['Selected source asset'],
          }),
        ]),
      },
      productionPlan: {
        nextStepId: 'visual-generation',
      },
      previewPlan: {
        productionPlan: {
          nextStepId: 'visual-generation',
        },
      },
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toMatchObject({
      mode: 'screenshot',
      preferredProviderId: 'browser-test',
    });
  });

  it('uses an explicit local Playwright runner for full-auto capture', async () => {
    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: localAppProject(),
          captureRunner: {
            kind: 'playwright-local',
            outputDir: 'outputs/motion-captures/tong-full-auto',
            launchLocalApp: true,
            headless: false,
            timeoutMs: 12000,
          },
          captureRequestIds: ['capture-local-app-still'],
          requestedAt: 752,
          updatedAt: 753,
          requestedEngines: ['hyperframes'],
          maxSteps: 1,
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
        reason: 'max-steps',
        stepId: 'visual-source',
        advancedStepIds: ['capture'],
        receiptCount: 1,
      },
      captureRunner: {
        kind: 'playwright-local',
        providerId: 'browser-capture',
        launchLocalApp: true,
        headless: false,
        timeoutMs: 12000,
      },
      providers: {
        capture: [
          {
            id: 'browser-capture',
            displayName: 'Playwright local capture',
            available: true,
          },
        ],
      },
      project: {
        id: 'motion-tong-launch',
        updatedAt: 753,
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-capture-browser-capture-753',
            gateId: 'capture',
            receiptCount: 1,
            receiptLabels: ['Screenshot'],
          }),
        ]),
      },
    });
    expect(json.captureRunner.outputDir).toMatch(/outputs\/motion-captures\/tong-full-auto$/);
    expect(captureRunnerMock.createLocalAppLauncher).toHaveBeenCalledTimes(1);
    expect(captureRunnerMock.createdOptions.at(-1)).toMatchObject({
      headless: false,
      timeoutMs: 12000,
    });
    expect(captureRunnerMock.createdOptions.at(-1)?.launchApp).toBe(
      captureRunnerMock.launchApp
    );
    expect(captureRunnerMock.captureCalls.at(-1)).toMatchObject({
      mode: 'screenshot',
      preferredProviderId: 'browser-capture',
      appLaunch: {
        command: 'npm run dev',
        cwd: '/Users/erniesg/code/erniesg/tong',
        targetUrl: 'http://localhost:3000/',
      },
    });
  });

  it('saves local-app setup dry-run receipts without running the capture gate', async () => {
    const captureCallCount = captureRunnerMock.captureCalls.length;
    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: localAppProject(),
          setupDryRun: {
            setupId: 'local-app',
          },
          captureRunner: {
            kind: 'playwright-local',
            outputDir: 'outputs/motion-captures/tong-full-auto',
            launchLocalApp: true,
            headless: true,
            timeoutMs: 12000,
          },
          requestedAt: 762,
          updatedAt: 763,
          requestedEngines: ['hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'paused',
      setupDryRun: {
        setupId: 'local-app',
        receiptLabels: ['HTTP readiness receipt', 'process cleanup receipt'],
      },
      run: {
        reason: 'provider-required',
        stepId: 'capture',
        advancedStepIds: [],
        receiptCount: 1,
      },
      project: {
        id: 'motion-tong-launch',
        updatedAt: 763,
        executionHistory: [
          expect.objectContaining({
            id: 'execution-setup-local-app-763',
            gateId: 'setup',
            label: 'Local app runner',
            receiptCount: 2,
            receiptLabels: ['HTTP readiness receipt', 'process cleanup receipt'],
          }),
        ],
      },
      productionPlan: {
        nextStepId: 'capture',
      },
      previewPlan: {
        capabilitySetup: {
          nextActionLabel: 'Connect visual sources',
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'local-app',
              status: 'configured',
              dryRunPendingLabels: [],
              dryRunCompletedLabels: ['HTTP readiness receipt', 'process cleanup receipt'],
            }),
          ]),
        },
      },
    });
    expect(captureRunnerMock.captureCalls).toHaveLength(captureCallCount);
  });

  it('saves provider setup dry-run receipts without invoking generation, voice, or render', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    const synthesize = vi.fn(async (request: VoiceSynthesisRequest) => voiceResultFor(request));
    const render = vi.fn(async (request: MotionRenderRequest) => renderResultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );
    unregister.push(registerVoiceProvider('voice-test', () => voiceProvider(synthesize)));
    unregister.push(registerMotionRenderProvider('remotion-test', () => renderProvider(render)));

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const baseProject = projectWithSelectedVisualSource();
    const cases = [
      {
        setupId: 'visual-source',
        body: {},
        expectedGateId: 'visual-source',
        expectedLabel: 'Visual sourcing',
        expectedReceipts: ['source asset receipt', 'prompt receipt'],
      },
      {
        setupId: 'visual-generation',
        body: { imageToVideoProviderId: 'image-video-test' },
        expectedGateId: 'visual-generation',
        expectedLabel: 'Image-to-video',
        expectedReceipts: ['generated clip receipt', 'timeline update receipt'],
      },
      {
        setupId: 'voice',
        body: { voiceProviderId: 'voice-test' },
        expectedGateId: 'voice',
        expectedLabel: 'Voice and captions',
        expectedReceipts: ['audio receipt', 'word timing receipt', 'transcript receipt'],
      },
      {
        setupId: 'render',
        body: { renderProviderId: 'remotion-test', renderEngine: 'remotion' },
        expectedGateId: 'render',
        expectedLabel: 'Render runner',
        expectedReceipts: ['source lint', 'contact sheet', 'mp4 probe'],
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const res = await POST(
        new Request('http://localhost/api/motion/full-auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: baseProject,
            setupDryRun: {
              setupId: testCase.setupId,
            },
            requestedAt: 772 + index,
            updatedAt: 782 + index,
            requestedEngines: ['remotion'],
            ...testCase.body,
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        ok: true,
        status: 'paused',
        setupDryRun: {
          setupId: testCase.setupId,
          gateId: testCase.expectedGateId,
          receiptLabels: testCase.expectedReceipts,
        },
        project: {
          executionHistory: expect.arrayContaining([
            expect.objectContaining({
              gateId: 'setup',
              label: testCase.expectedLabel,
              receiptLabels: testCase.expectedReceipts,
            }),
          ]),
        },
        previewPlan: {
          capabilitySetup: {
            items: expect.arrayContaining([
              expect.objectContaining({
                id: testCase.setupId,
                dryRunPendingLabels: [],
                dryRunCompletedLabels: testCase.expectedReceipts,
              }),
            ]),
          },
        },
      });
    }

    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('uses env-configured render providers for render setup dry-runs', async () => {
    process.env.AETHER_REMOTION_RENDER_PROJECT_DIR = '/tmp/aether-remotion-render';

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithSelectedVisualSource(),
          setupDryRun: {
            setupId: 'render',
          },
          renderEngine: 'remotion',
          requestedAt: 792,
          updatedAt: 793,
          requestedEngines: ['remotion'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      setupDryRun: {
        setupId: 'render',
        gateId: 'render',
        receiptLabels: ['source lint', 'contact sheet', 'mp4 probe'],
      },
      project: {
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-setup-render-793',
            gateId: 'setup',
            label: 'Render runner',
            providerId: 'remotion-local',
            receiptLabels: ['source lint', 'contact sheet', 'mp4 probe'],
          }),
        ]),
      },
      providers: {
        render: [
          {
            id: 'remotion-local',
            engine: 'remotion',
            displayName: 'Remotion local render',
            available: true,
          },
        ],
      },
    });
  });

  it('executes image-to-video providers for selected visual sources before pausing at voice', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithSelectedVisualSource(),
          imageToVideoProviderId: 'image-video-test',
          imageToVideoClipIds: ['clip-beat-demo-text'],
          requestedAt: 712,
          updatedAt: 713,
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
        stepId: 'voice',
        advancedStepIds: ['visual-generation'],
        receiptCount: 2,
      },
      project: {
        id: 'motion-aether-launch',
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-image-to-video-image-video-test-713',
            gateId: 'visual-generation',
            receiptCount: 1,
            receiptLabels: ['Generated clip'],
          }),
        ]),
      },
      productionPlan: {
        nextStepId: 'voice',
      },
      previewPlan: {
        productionPlan: {
          nextStepId: 'voice',
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      id: 'image-to-video-clip-beat-demo-text',
      clipId: 'clip-beat-demo-text',
      sourceAssetId: 'capture-aether-homepage',
    });

    const generatedClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-demo-text');
    expect(generatedClip).toMatchObject({
      assetId: 'generated-clip-beat-demo-text-image-to-video',
      props: {
        generatedVideoAssetId: 'generated-clip-beat-demo-text-image-to-video',
        imageToVideoProviderId: 'image-video-test',
        sourceVisualAssetId: 'capture-aether-homepage',
        status: 'ready',
      },
    });
  });

  it('chains capture, visual-source selection, and image-to-video in full-auto mode', async () => {
    const capture = vi.fn(async (): Promise<CaptureResult> => screenshotCaptureResult);
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    unregister.push(registerCaptureProvider('browser-test', () => captureProvider(capture)));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          captureProviderId: 'browser-test',
          imageToVideoProviderId: 'image-video-test',
          imageToVideoClipIds: ['clip-beat-demo-text'],
          requestedAt: 722,
          updatedAt: 723,
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
        stepId: 'voice',
        advancedStepIds: ['capture', 'visual-source', 'visual-generation'],
        receiptCount: 3,
        reviewPacket: {
          kind: 'motion-full-auto-review-packet',
          status: 'paused',
          mode: 'full-auto',
          advancedStepLabels: ['Product capture', 'Visual sourcing', 'Image-to-video'],
          savedReceiptLabels: ['Screenshot', 'Selected source asset', 'Generated clip'],
          savedReceiptCount: 3,
          savedArtifacts: [
            expect.objectContaining({
              kind: 'capture',
              label: 'Screenshot',
              ref: 'capture-aether-homepage',
              assetUrl: 'asset://captures/aether-homepage.png',
              mimeType: 'image/png',
            }),
            expect.objectContaining({
              kind: 'visual-source',
              label: 'Selected source asset',
              ref: 'capture-aether-homepage',
              assetUrl: 'asset://captures/aether-homepage.png',
              mimeType: 'image/png',
            }),
            expect.objectContaining({
              kind: 'image-to-video',
              label: 'Generated clip',
              ref: 'generated-clip-beat-demo-text-image-to-video',
              assetUrl: 'asset://generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
              path: 'generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
              mimeType: 'video/mp4',
            }),
          ],
          editableSurfaceLabels: expect.arrayContaining([
            'capture',
            'visual',
            'image-to-video',
            'component',
          ]),
          proofLabels: expect.arrayContaining([
            'screenshots',
            'source asset picks',
            'generated clips',
          ]),
          nextReviewLabel: 'Voice and captions',
          nextActionLabel: 'Generate voice and word timings',
          nextRouteLabels: ['/api/motion/voice'],
          nextToolLabels: ['motion-voice'],
        },
      },
      project: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-visual-sourcing-plan',
            kind: 'visual-search',
            outputRefs: ['capture-aether-homepage'],
            status: 'done',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({ gateId: 'capture' }),
          expect.objectContaining({ gateId: 'visual-source' }),
          expect.objectContaining({ gateId: 'visual-generation' }),
        ]),
      },
      productionPlan: {
        nextStepId: 'voice',
      },
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      id: 'image-to-video-clip-beat-demo-text',
      sourceAssetId: 'capture-aether-homepage',
    });
  });

  it('chains image-to-video, voice synthesis, and sync before the render gate', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    const synthesize = vi.fn(async (request: VoiceSynthesisRequest) => voiceResultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );
    unregister.push(registerVoiceProvider('voice-test', () => voiceProvider(synthesize)));

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithSelectedVisualSource(),
          imageToVideoProviderId: 'image-video-test',
          imageToVideoClipIds: ['clip-beat-demo-text'],
          voiceProviderId: 'voice-test',
          requestedAt: 732,
          updatedAt: 733,
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
        stepId: 'render',
        advancedStepIds: ['visual-generation', 'voice', 'sync'],
      },
      project: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-voice-plan',
            kind: 'voice',
            status: 'done',
          }),
          expect.objectContaining({
            id: 'node-sync-plan',
            kind: 'sync',
            providerId: 'motion-sync',
            status: 'done',
            outputRefs: expect.arrayContaining([
              'sync-marker-beat-hook',
              'caption-link-clip-beat-hook-caption',
              'transition-cue-clip-transition-beat-hook-to-beat-problem',
              'sfx-clip-transition-beat-hook-to-beat-problem',
            ]),
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'voice',
            receiptLabels: ['Audio', 'Word timings', 'Transcript'],
          }),
          expect.objectContaining({
            id: 'execution-sync-motion-sync-733',
            gateId: 'sync',
            receiptLabels: ['Beat markers', 'Caption links', 'Transition cues', 'Sound cues'],
          }),
        ]),
      },
      productionPlan: {
        nextStepId: 'render',
      },
      previewPlan: {
        productionPlan: {
          nextStepId: 'render',
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);

    const hookCaption = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-caption');
    expect(hookCaption.props).toMatchObject({
      syncPlanId: 'sync-plan-motion-aether-launch-draft-primary',
      syncStatus: 'synced',
      timingSource: 'word-timings',
    });
  });

  it('chains image-to-video, voice, sync, and render into a ready export pack', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    const synthesize = vi.fn(async (request: VoiceSynthesisRequest) => voiceResultFor(request));
    const render = vi.fn(async (request: MotionRenderRequest) => renderResultFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );
    unregister.push(registerVoiceProvider('voice-test', () => voiceProvider(synthesize)));
    unregister.push(registerMotionRenderProvider('remotion-test', () => renderProvider(render)));

    const { POST } = await import('@/app/api/motion/full-auto/route');
    const res = await POST(
      new Request('http://localhost/api/motion/full-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectWithSelectedVisualSource(),
          imageToVideoProviderId: 'image-video-test',
          imageToVideoClipIds: ['clip-beat-demo-text'],
          voiceProviderId: 'voice-test',
          renderProviderId: 'remotion-test',
          renderEngine: 'remotion',
          requestedAt: 742,
          updatedAt: 743,
          requestedEngines: ['remotion'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      run: {
        status: 'complete',
        reason: null,
        stepId: null,
        advancedStepIds: ['visual-generation', 'voice', 'sync', 'render', 'export'],
      },
      project: {
        exports: [
          {
            id: 'export-x-9x16',
            status: 'ready',
            assetId: 'render-export-x-9x16-video',
            posterAssetId: 'render-export-x-9x16-poster',
            subtitleAssetId: 'render-export-x-9x16-subtitle',
            transcriptAssetId: 'render-export-x-9x16-transcript',
            manifestAssetId: 'render-export-x-9x16-manifest',
          },
        ],
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-render-plan-remotion',
            kind: 'render',
            providerId: 'remotion-test',
            status: 'done',
            outputRefs: expect.arrayContaining([
              'render-export-x-9x16-video',
              'render-export-x-9x16-manifest',
            ]),
          }),
          expect.objectContaining({
            id: 'node-export-pack-motion-aether-launch-draft-primary',
            kind: 'export-pack',
            status: 'done',
            outputRefs: ['export-pack-motion-aether-launch-draft-primary-manifest'],
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            id: 'execution-render-remotion-test-743',
            gateId: 'render',
            receiptLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
          }),
          expect.objectContaining({
            id: 'execution-render-package-remotion-test-render-plan-motion-aether-launch-draft-primary-remotion-743',
            gateId: 'render',
            label: 'Render package verification',
            providerId: 'remotion-test',
            receiptLabels: [
              'Render source manifest',
              'Render one-frame layout check',
              'MP4 artifact check',
              'Poster artifact check',
              'Subtitles artifact check',
              'Transcript artifact check',
              'Manifest artifact check',
            ],
          }),
          expect.objectContaining({
            id: 'execution-export-pack-motion-aether-launch-draft-primary-743',
            gateId: 'export',
            label: 'Export pack',
            receiptLabels: [
              'Export pack manifest',
              'Canvas drop candidates',
              'Pack provenance',
            ],
          }),
        ]),
      },
      productionPlan: {
        status: 'complete',
        nextStepId: null,
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: 'export',
            status: 'complete',
            verificationReceipts: [
              expect.objectContaining({
                kind: 'export',
                label: 'Export pack manifest',
                path: 'export-packs/motion-aether-launch/draft-primary/manifest.json',
              }),
            ],
          }),
        ]),
      },
      previewPlan: {
        executionHistory: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              label: 'Render package verification',
              receiptLabels: expect.arrayContaining([
                'Render one-frame layout check',
                'MP4 artifact check',
              ]),
            }),
          ]),
        },
        productionPlan: {
          status: 'complete',
          nextStepId: null,
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0]).toMatchObject({
      engine: 'remotion',
      compositionId: 'motion-aether-launch-draft-primary',
      outputs: expect.arrayContaining([
        expect.objectContaining({
          id: 'render-export-x-9x16-video',
          kind: 'video',
          path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
        }),
      ]),
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

function restoreRenderEnv(): void {
  for (const key of RENDER_ENV_KEYS) {
    const original = ORIGINAL_RENDER_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

function clearVoiceEnv(): void {
  for (const key of VOICE_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreVoiceEnv(): void {
  for (const key of VOICE_ENV_KEYS) {
    const original = ORIGINAL_VOICE_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

function clearImageToVideoEnv(): void {
  for (const key of IMAGE_TO_VIDEO_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreImageToVideoEnv(): void {
  for (const key of IMAGE_TO_VIDEO_ENV_KEYS) {
    const original = ORIGINAL_IMAGE_TO_VIDEO_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}
