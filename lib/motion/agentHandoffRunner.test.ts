import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runMotionAgentHandoffTemplates } from './agentHandoffRunner';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
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
import type { CaptureRequest, CaptureResult } from '@/lib/providers/capture/types';

const captureRunnerMock = vi.hoisted(() => {
  const captureCalls: CaptureRequest[] = [];
  const launchApp = vi.fn(async () => ({ close: vi.fn(async () => undefined) }));
  const createLocalAppLauncher = vi.fn(() => launchApp);

  return {
    captureCalls,
    launchApp,
    createLocalAppLauncher,
  };
});

vi.mock('@/lib/providers/capture/local-app-launch', () => ({
  createLocalAppLauncher: captureRunnerMock.createLocalAppLauncher,
}));

vi.mock('@/lib/providers/capture/playwright', () => ({
  createPlaywrightBrowserCaptureProvider: () => ({
    id: 'browser-capture',
    displayName: 'Playwright local capture',
    available: () => true,
    capture: async (request: CaptureRequest): Promise<CaptureResult> => {
      captureRunnerMock.captureCalls.push(request);

      return {
        providerId: 'browser-capture',
        artifacts: [
          {
            id: `handoff-${request.mode}`,
            kind: request.mode === 'dom-snapshot' ? 'snapshot' : 'screenshot',
            assetUrl: `asset://handoff/${request.mode}`,
            width: request.viewport.width,
            height: request.viewport.height,
            mimeType: request.mode === 'dom-snapshot' ? 'application/json' : 'image/png',
            viewport: request.viewport,
            cursorTargets: [],
            provenance: [{ kind: 'provider', ref: 'playwright-browser-runner' }],
          },
        ],
        provenance: [{ kind: 'provider', ref: 'browser-capture' }],
      };
    },
  }),
}));

const tempDirs: string[] = [];

async function makeLocalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-handoff-runner-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'tong',
      description: 'City-specific language learning app.',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        dev: 'next dev',
      },
    })
  );
  await writeFile(
    join(dir, 'README.md'),
    'Tong is a Next.js and React city-language app with TypeScript practice flows.'
  );
  await writeFile(join(dir, 'src', 'page.tsx'), 'export default function Page() {}');
  return dir;
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
        provenance: [{ kind: 'provider', ref: 'image-video-test' }, ...request.output.provenance],
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
      provenance: [{ kind: 'provider', ref: 'voice-test' }, ...artifact.provenance],
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
      provenance: [{ kind: 'provider', ref: 'remotion-test' }, ...output.provenance],
    })),
    provenance: [{ kind: 'provider', ref: 'remotion-test' }],
  };
}

describe('runMotionAgentHandoffTemplates', () => {
  const unregister: Array<() => void> = [];

  afterEach(async () => {
    while (unregister.length > 0) unregister.pop()?.();
    captureRunnerMock.captureCalls.splice(0);
    captureRunnerMock.createLocalAppLauncher.mockClear();
    captureRunnerMock.launchApp.mockClear();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('executes materialized start handoff templates through setup and full-auto routes', async () => {
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

    const repoPath = await makeLocalRepo();
    const { POST: startPOST } = await import('@/app/api/motion/start/route');
    const { POST: fullAutoPOST } = await import('@/app/api/motion/full-auto/route');
    const startRes = await startPOST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-tong-handoff-run',
          workspaceId: 'demo-ws',
          repoPath,
          intent: 'launch',
          mode: 'full-auto',
          audience: 'language learners',
          tone: 'textural',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes'],
          createdAt: 810,
        }),
      })
    );
    const startJson = await startRes.json();
    expect(startJson.ok).toBe(true);

    const result = await runMotionAgentHandoffTemplates({
      handoff: startJson.agentHandoff,
      project: startJson.project,
      templateIds: [
        'setup-local-app',
        'setup-visual-source',
        'setup-visual-generation',
        'setup-voice',
        'setup-render',
        'full-auto-run',
      ],
      input: {
        imageToVideoProviderId: 'image-video-test',
        voiceProviderId: 'voice-test',
        renderProviderId: 'remotion-test',
      },
      dispatch: async (request) => {
        expect(request.route).toBe('/api/motion/full-auto');
        const response = await fullAutoPOST(
          new Request(`http://localhost${request.route}`, {
            method: request.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body),
          })
        );
        return {
          status: response.status,
          json: await response.json(),
        };
      },
    });

    expect(result).toMatchObject({
      status: 'complete',
      finalProject: {
        id: 'motion-tong-handoff-run',
        exports: [
          expect.objectContaining({
            id: 'export-x-9x16',
            status: 'ready',
            assetId: 'render-export-x-9x16-video',
          }),
        ],
      },
      finalResponse: {
        ok: true,
        status: 'complete',
        run: {
          status: 'complete',
          reason: null,
          advancedStepIds: [
            'capture',
            'visual-source',
            'visual-generation',
            'voice',
            'sync',
            'render',
            'export',
          ],
        },
      },
    });
    expect(result.steps.map((step) => step.templateId)).toEqual([
      'setup-local-app',
      'setup-visual-source',
      'setup-visual-generation',
      'setup-voice',
      'setup-render',
      'full-auto-run',
    ]);
    expect(result.steps.find((step) => step.templateId === 'full-auto-run')?.capturePlan).toMatchObject({
      kind: 'motion-agent-capture-template-plan',
      requestIds: ['capture-local-app-still', 'capture-local-dom'],
      requestModes: ['screenshot', 'dom-snapshot'],
      runnerLabel: 'Playwright local capture',
      receiptLabels: expect.arrayContaining([
        'screenshot',
        'snapshot',
        'app launch readiness',
      ]),
    });
    expect(result.steps.every((step) => step.missingPlaceholders.length === 0)).toBe(true);
    expect(result.finalProject.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gateId: 'setup', label: 'Local app runner' }),
        expect.objectContaining({ gateId: 'setup', label: 'Visual sourcing' }),
        expect.objectContaining({ gateId: 'setup', label: 'Image-to-video' }),
        expect.objectContaining({ gateId: 'setup', label: 'Voice and captions' }),
        expect.objectContaining({ gateId: 'setup', label: 'Render runner' }),
        expect.objectContaining({ gateId: 'capture' }),
        expect.objectContaining({ gateId: 'visual-source' }),
        expect.objectContaining({ gateId: 'visual-generation' }),
        expect.objectContaining({ gateId: 'voice' }),
        expect.objectContaining({ gateId: 'sync' }),
        expect.objectContaining({ gateId: 'render' }),
      ])
    );
    expect(captureRunnerMock.captureCalls).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
