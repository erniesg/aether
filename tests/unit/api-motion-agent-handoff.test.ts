import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMotionRenderRequest } from '@/lib/motion/renderExecution';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
import type { CaptureRequest, CaptureResult } from '@/lib/providers/capture/types';
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
            id: `agent-route-${request.mode}`,
            kind:
              request.mode === 'screen-recording'
                ? 'recording'
                : request.mode === 'dom-snapshot'
                  ? 'snapshot'
                  : 'screenshot',
            assetUrl: `asset://agent-route/${request.mode}${
              request.mode === 'screen-recording' ? '.webm' : ''
            }`,
            width: request.viewport.width,
            height: request.viewport.height,
            durationMs: request.mode === 'screen-recording' ? 3000 : undefined,
            mimeType:
              request.mode === 'screen-recording'
                ? 'video/webm'
                : request.mode === 'dom-snapshot'
                  ? 'application/json'
                  : 'image/png',
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
  const dir = await mkdtemp(join(tmpdir(), 'aether-api-motion-agent-handoff-'));
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

function voiceProvider(
  synthesize: VoiceProvider['synthesize'],
  id = 'voice-test'
): VoiceProvider {
  return {
    id,
    displayName: 'Voice test synthesis',
    available: () => true,
    synthesize,
  };
}

function voiceResultFor(
  request: VoiceSynthesisRequest,
  providerId = 'voice-test'
): VoiceSynthesisResult {
  return {
    providerId,
    artifacts: request.expectedArtifacts.map((artifact) => ({
      ...artifact,
      assetUrl: `asset://${artifact.path}`,
      ...(artifact.kind === 'audio' ? { durationMs: request.durationFrames * 30 } : {}),
      provenance: [{ kind: 'provider', ref: providerId }, ...artifact.provenance],
    })),
    provenance: [{ kind: 'provider', ref: providerId }],
  };
}

function renderProvider(
  render: MotionRenderProvider['render'],
  id = 'remotion-test'
): MotionRenderProvider {
  return {
    id,
    engine: 'remotion',
    displayName: 'Remotion test render',
    available: () => true,
    render,
  };
}

function renderResultFor(
  request: MotionRenderRequest,
  providerId = 'remotion-test'
): MotionRenderResult {
  return {
    providerId,
    engine: 'remotion',
    outputs: request.outputs.map((output) => ({
      ...output,
      assetUrl: `asset://${output.path}`,
      provenance: [{ kind: 'provider', ref: providerId }, ...output.provenance],
    })),
    provenance: [{ kind: 'provider', ref: providerId }],
  };
}

async function startLocalRepoProject(mode: 'review' | 'full-auto' = 'full-auto') {
  const repoPath = await makeLocalRepo();
  const { POST: startPOST } = await import('@/app/api/motion/start/route');
  const res = await startPOST(
    new Request('http://localhost/api/motion/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'motion-tong-agent-route',
        workspaceId: 'demo-ws',
        repoPath,
        intent: 'launch',
        mode,
        audience: 'language learners',
        tone: 'textural',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: ['remotion', 'hyperframes'],
        createdAt: 820,
      }),
    })
  );

  expect(res.status).toBe(200);
  return res.json();
}

describe('POST /api/motion/agent-handoff', () => {
  const unregister: Array<() => void> = [];

  afterEach(async () => {
    while (unregister.length > 0) unregister.pop()?.();
    captureRunnerMock.captureCalls.splice(0);
    captureRunnerMock.createLocalAppLauncher.mockClear();
    captureRunnerMock.launchApp.mockClear();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('runs selected start handoff templates through the agent-native route', async () => {
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

    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      finalProject: {
        id: 'motion-tong-agent-route',
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
          advancedStepIds: [
            'capture',
            'visual-source',
            'visual-generation',
            'voice',
            'sync',
            'render',
          ],
        },
      },
      steps: expect.arrayContaining([
        expect.objectContaining({ templateId: 'setup-local-app', status: 'complete' }),
        expect.objectContaining({ templateId: 'full-auto-run', status: 'complete' }),
      ]),
    });
    expect(json.steps.map((step: { templateId: string }) => step.templateId)).toEqual([
      'setup-local-app',
      'setup-visual-source',
      'setup-visual-generation',
      'setup-voice',
      'setup-render',
      'full-auto-run',
    ]);
    expect(captureRunnerMock.captureCalls).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('runs full-auto with an approved computer-use capture runner', async () => {
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

    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['full-auto-computer-use-run'],
          input: {
            imageToVideoProviderId: 'image-video-test',
            voiceProviderId: 'voice-test',
            renderProviderId: 'remotion-test',
            computerUseCaptureRunner: {
              kind: 'computer-use-local',
              approved: true,
              redactionManifest: {
                labels: ['tokens', 'emails'],
                applied: true,
                receiptRef: 'full-auto-redaction-pass',
              },
              receipts: [
                {
                  assetUrl: 'asset://computer-use/tong-full-auto.png',
                  width: 1080,
                  height: 1920,
                  mimeType: 'image/png',
                  redactions: [
                    {
                      label: 'tokens',
                      target: 'settings panel',
                      action: 'blur',
                      applied: true,
                    },
                  ],
                },
              ],
            },
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      finalProject: {
        id: 'motion-tong-agent-route',
        exports: [
          expect.objectContaining({
            id: 'export-x-9x16',
            status: 'ready',
            assetId: 'render-export-x-9x16-video',
          }),
        ],
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'capture',
            label: 'Product capture',
            providerId: 'computer-use-capture',
          }),
          expect.objectContaining({ gateId: 'render' }),
        ]),
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'capture',
            providerId: 'computer-use-capture',
            status: 'done',
          }),
        ]),
      },
      finalResponse: {
        ok: true,
        status: 'complete',
        run: {
          advancedStepIds: [
            'capture',
            'visual-source',
            'visual-generation',
            'voice',
            'sync',
            'render',
          ],
        },
        captureRunner: expect.objectContaining({
          kind: 'computer-use-local',
          providerId: 'computer-use-capture',
          approved: true,
          receiptCount: 1,
        }),
      },
      steps: [
        expect.objectContaining({
          templateId: 'full-auto-computer-use-run',
          status: 'complete',
          responseStatus: 200,
        }),
      ],
    });
    const appFrameClip = json.finalProject.tracks
      .flatMap((track: { clips: unknown[] }) => track.clips)
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      props: expect.objectContaining({
        captureArtifactKind: 'screenshot',
        captureProviderId: 'computer-use-capture',
        sourceAssetId: 'capture-computer-use-screenshot-http-localhost-3000',
        sourceVisualAssetId: 'capture-computer-use-screenshot-http-localhost-3000',
        generatedVideoAssetId: 'generated-clip-beat-demo-text-image-to-video',
      }),
    });
    expect(captureRunnerMock.captureCalls).toHaveLength(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('returns an explicit blocked run when selected source-edit templates still need files', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['edit-source'],
        }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: 'blocked',
      finalProject: {
        id: 'motion-tong-agent-route',
      },
      steps: [
        {
          templateId: 'edit-source',
          status: 'skipped',
          missingPlaceholders: ['$editedSourceFiles'],
          responseStatus: null,
          responseJson: null,
        },
      ],
    });
  });

  it('runs the guarded computer-use setup template when approval and redaction receipts are supplied', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['setup-computer-use'],
          input: {
            computerUseCaptureRunner: {
              kind: 'computer-use-local',
              approved: true,
              redactionManifest: {
                labels: ['tokens', 'private workspace names'],
                applied: true,
                receiptRef: 'redaction-pass-1',
              },
              receipts: [
                {
                  assetUrl: 'asset://computer-use/tong-auth-state.png',
                  width: 1080,
                  height: 1920,
                  mimeType: 'image/png',
                  redactions: [
                    {
                      label: 'tokens',
                      target: 'settings panel',
                      action: 'blur',
                      applied: true,
                    },
                  ],
                },
              ],
            },
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'setup-computer-use',
          status: 'complete',
          responseStatus: 200,
        }),
      ],
      finalResponse: {
        ok: true,
        setupDryRun: {
          setupId: 'computer-use',
          gateId: 'capture',
          receiptLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
        },
        previewPlan: {
          capabilitySetup: {
            items: expect.arrayContaining([
              expect.objectContaining({
                id: 'computer-use',
                status: 'configured',
                dryRunPendingLabels: [],
              }),
            ]),
          },
        },
      },
      finalProject: {
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'setup',
            label: 'Computer-use capture',
            receiptLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
          }),
        ]),
      },
    });
  });

  it('applies approved computer-use capture receipts through the capture handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['review-computer-use-capture'],
          input: {
            computerUseCaptureRunner: {
              kind: 'computer-use-local',
              approved: true,
              redactionManifest: {
                labels: ['tokens', 'emails'],
                applied: true,
                receiptRef: 'redaction-pass-2',
              },
              receipts: [
                {
                  assetUrl: 'asset://computer-use/tong-product-flow.png',
                  width: 1080,
                  height: 1920,
                  redactions: [
                    {
                      label: 'tokens',
                      target: 'settings panel',
                      action: 'blur',
                      applied: true,
                    },
                  ],
                },
              ],
            },
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'review-computer-use-capture',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            status: 'captured',
            captureRunner: expect.objectContaining({
              kind: 'computer-use-local',
              providerId: 'computer-use-capture',
              approved: true,
              receiptCount: 1,
            }),
          }),
        }),
      ],
      finalProject: {
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'capture',
            label: 'Product capture',
            providerId: 'computer-use-capture',
          }),
        ]),
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'capture',
            providerId: 'computer-use-capture',
            status: 'done',
          }),
        ]),
      },
    });
    const appFrameClip = json.finalProject.tracks
      .flatMap((track: { clips: unknown[] }) => track.clips)
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      assetId: 'capture-computer-use-screenshot-http-localhost-3000',
      props: expect.objectContaining({
        assetUrl: 'asset://computer-use/tong-product-flow.png',
        captureArtifactKind: 'screenshot',
        captureProviderId: 'computer-use-capture',
        redactions: [
          {
            label: 'tokens',
            target: 'settings panel',
            action: 'blur',
            applied: true,
          },
        ],
      }),
    });
  });

  it('stages and applies a generated video take through review handoff templates', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );

    const startJson = await startLocalRepoProject('review');
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['review-capture', 'generate-visuals', 'apply-generated-video-take'],
          input: {
            imageToVideoProviderId: 'image-video-test',
            generatedVideoClipId: 'clip-beat-demo-text',
            generatedVideoTakeId: 'generated-clip-beat-demo-text-image-to-video',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({ templateId: 'review-capture', status: 'complete' }),
        expect.objectContaining({
          templateId: 'generate-visuals',
          status: 'complete',
          responseJson: expect.objectContaining({
            ok: true,
            status: 'generated-for-review',
          }),
        }),
        expect.objectContaining({
          templateId: 'apply-generated-video-take',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            status: 'take-applied',
          }),
        }),
      ],
      finalProject: {
        tracks: expect.arrayContaining([
          expect.objectContaining({
            clips: expect.arrayContaining([
              expect.objectContaining({
                id: 'clip-beat-demo-text',
                assetId: 'generated-clip-beat-demo-text-image-to-video',
                props: expect.objectContaining({
                  generatedVideoAssetId: 'generated-clip-beat-demo-text-image-to-video',
                  selectedGeneratedVideoTakeId: 'generated-clip-beat-demo-text-image-to-video',
                }),
              }),
            ]),
          }),
        ]),
      },
      finalResponse: {
        previewPlan: {
          visualGenerationSummary: {
            nodePlan: {
              nextNodeId: 'timeline-update',
            },
          },
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('auto-applies the pending generated video take when no take ids are supplied', async () => {
    const generate = vi.fn(async (request: MotionImageToVideoRequest) => generatedClipFor(request));
    unregister.push(
      registerMotionImageToVideoProvider('image-video-test', () =>
        imageToVideoProvider(generate)
      )
    );

    const startJson = await startLocalRepoProject('review');
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['review-capture', 'generate-visuals', 'apply-generated-video-take'],
          input: {
            imageToVideoProviderId: 'image-video-test',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({ templateId: 'review-capture', status: 'complete' }),
        expect.objectContaining({ templateId: 'generate-visuals', status: 'complete' }),
        expect.objectContaining({
          templateId: 'apply-generated-video-take',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            status: 'take-applied',
          }),
        }),
      ],
      finalProject: {
        tracks: expect.arrayContaining([
          expect.objectContaining({
            clips: expect.arrayContaining([
              expect.objectContaining({
                id: 'clip-beat-demo-text',
                assetId: 'generated-clip-beat-demo-text-image-to-video',
                props: expect.objectContaining({
                  selectedGeneratedVideoTakeId: 'generated-clip-beat-demo-text-image-to-video',
                }),
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it('uses the selected voice provider when generating voice through review handoff', async () => {
    const defaultSynthesize = vi.fn(async (request: VoiceSynthesisRequest) =>
      voiceResultFor(request, 'voice-default')
    );
    const selectedSynthesize = vi.fn(async (request: VoiceSynthesisRequest) =>
      voiceResultFor(request, 'voice-selected')
    );
    unregister.push(
      registerVoiceProvider('voice-default', () =>
        voiceProvider(defaultSynthesize, 'voice-default')
      )
    );
    unregister.push(
      registerVoiceProvider('voice-selected', () =>
        voiceProvider(selectedSynthesize, 'voice-selected')
      )
    );

    const startJson = await startLocalRepoProject('review');
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['generate-voice'],
          input: {
            voiceProviderId: 'voice-selected',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'generate-voice',
          status: 'complete',
          responseJson: expect.objectContaining({
            status: 'synthesized',
          }),
        }),
      ],
      finalProject: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'voice',
            providerId: 'voice-selected',
          }),
        ]),
      },
    });
    expect(defaultSynthesize).not.toHaveBeenCalled();
    expect(selectedSynthesize).toHaveBeenCalledTimes(6);
  });

  it('uses the selected render provider when rendering proof through review handoff', async () => {
    const defaultRender = vi.fn(async (request: MotionRenderRequest) =>
      renderResultFor(request, 'remotion-default')
    );
    const selectedRender = vi.fn(async (request: MotionRenderRequest) =>
      renderResultFor(request, 'remotion-selected')
    );
    unregister.push(
      registerMotionRenderProvider('remotion-default', () =>
        renderProvider(defaultRender, 'remotion-default')
      )
    );
    unregister.push(
      registerMotionRenderProvider('remotion-selected', () =>
        renderProvider(selectedRender, 'remotion-selected')
      )
    );

    const startJson = await startLocalRepoProject('review');
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['render-proof'],
          input: {
            renderProviderId: 'remotion-selected',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'render-proof',
          status: 'complete',
          responseJson: expect.objectContaining({
            status: 'rendered',
            renderResult: expect.objectContaining({
              providerId: 'remotion-selected',
            }),
          }),
        }),
      ],
      finalProject: {
        exports: [
          expect.objectContaining({
            status: 'ready',
            assetId: 'render-export-x-9x16-video',
          }),
        ],
      },
    });
    expect(defaultRender).not.toHaveBeenCalled();
    expect(selectedRender).toHaveBeenCalledTimes(1);
  });

  it('records a product flow through the recording handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['record-product-flow'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('complete');
    expect(json.steps).toHaveLength(1);
    expect(json.steps[0]).toMatchObject({
      templateId: 'record-product-flow',
      status: 'complete',
      responseStatus: 200,
      responseJson: expect.objectContaining({
        ok: true,
        status: 'captured',
        selectedRequests: [expect.objectContaining({ id: 'record-local-flow' })],
        captureRunner: expect.objectContaining({
          kind: 'playwright-local',
          providerId: 'browser-capture',
        }),
      }),
    });
    expect(json.finalProject.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'capture',
          label: 'Product capture',
          providerId: 'browser-capture',
        }),
      ])
    );
    const captureNode = json.finalProject.graphNodes.find(
      (node: { kind?: string; providerId?: string }) =>
        node.kind === 'capture' && node.providerId === 'browser-capture'
    );
    expect(captureNode).toMatchObject({ status: 'done' });
    expect(captureNode.outputRefs).toContain('agent-route-screen-recording');
    expect(captureRunnerMock.captureCalls).toHaveLength(1);
    expect(captureRunnerMock.captureCalls[0]).toMatchObject({ mode: 'screen-recording' });

    const appFrameClip = json.finalProject.tracks
      .flatMap((track: { clips: unknown[] }) => track.clips)
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      assetId: 'agent-route-screen-recording',
      props: expect.objectContaining({
        assetUrl: 'asset://agent-route/screen-recording.webm',
        captureArtifactKind: 'recording',
        captureProviderId: 'browser-capture',
        durationMs: 3000,
        mimeType: 'video/webm',
      }),
    });
  });

  it('stages component regeneration through an agent handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['regenerate-component-clip-beat-demo-text-capture'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'regenerate-component-clip-beat-demo-text-capture',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            regenerationRequest: expect.objectContaining({
              projectId: 'motion-tong-agent-route',
              clipId: 'clip-beat-demo-text',
              componentId: 'app-frame',
              scope: 'capture',
              prompt: 'Regenerate capture for App frame',
              status: 'planned',
            }),
          }),
        }),
      ],
      finalProject: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'revision',
            inputRefs: expect.arrayContaining(['clip-beat-demo-text', 'beat-demo']),
            status: 'planned',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'drafts',
            label: 'Regenerate capture for App frame',
            receiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
          }),
        ]),
      },
      finalResponse: {
        previewPlan: {
          executionHistory: {
            status: 'saved',
            latestReceiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
          },
        },
      },
    });
  });

  it('stages reference-signal regeneration through an agent handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['reference-signal-hyperframes-launch-video-gallery-effect'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'reference-signal-hyperframes-launch-video-gallery-effect',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            regenerationRequest: expect.objectContaining({
              projectId: 'motion-tong-agent-route',
              referenceSignalId: 'hyperframes-launch-video-gallery',
              referenceTitle: 'HyperFrames launch video source gallery',
              sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
              scope: 'effect',
              componentIds: ['hook-card', 'app-frame'],
              componentLabels: ['Hook card', 'App frame'],
              prompt:
                'Apply reference style to Hook card / App frame. Use HyperFrames launch video source gallery as the source-backed reference signal.',
              status: 'planned',
            }),
          }),
        }),
      ],
      finalProject: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'revision',
            inputRefs: [
              'hyperframes-launch-video-gallery',
              'https://hyperframes.heygen.com/launch-videos',
              'hook-card',
              'app-frame',
            ],
            status: 'planned',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'drafts',
            label: 'Apply reference style to Hook card / App frame',
            receiptLabels: ['Reference signal', 'Component style update', 'Source patch plan'],
          }),
        ]),
      },
      finalResponse: {
        previewPlan: {
          executionHistory: {
            status: 'saved',
            latestReceiptLabels: ['Reference signal', 'Component style update', 'Source patch plan'],
          },
        },
      },
    });
  });

  it('selects a draft variation through an agent handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['select-draft-draft-demo-first'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'select-draft-draft-demo-first',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            regenerationRequest: expect.objectContaining({
              projectId: 'motion-tong-agent-route',
              draftId: 'draft-demo-first',
              draftLabel: 'Demo-first cut',
              angle: 'show the product surface early, then back it with proof',
              prompt:
                'Use draft variation Demo-first cut. Show the product surface early, then back it with proof',
              status: 'planned',
            }),
          }),
        }),
      ],
      finalProject: {
        currentDraftId: 'draft-demo-first',
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            kind: 'revision',
            inputRefs: [
              'draft-demo-first',
              'beat-hook',
              'beat-demo',
              'beat-proof',
              'beat-payoff',
              'beat-problem',
              'beat-cta',
            ],
            status: 'planned',
          }),
        ]),
        executionHistory: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'drafts',
            label: 'Use draft variation Demo-first cut',
            receiptLabels: ['Draft variation', 'Updated preview plan'],
          }),
        ]),
      },
      finalResponse: {
        previewPlan: {
          draftId: 'draft-demo-first',
          executionHistory: {
            status: 'saved',
            latestReceiptLabels: ['Draft variation', 'Updated preview plan'],
          },
        },
      },
    });
  });

  it('applies direct timeline revision operations through an agent handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['apply-timeline-revision'],
          input: {
            timelineRevisionId: 'agent-hook-tighten',
            timelineRevisionOperations: [
              {
                kind: 'update-story-beat',
                beatId: 'beat-hook',
                narration: 'Tong turns a city repo into a launch-ready language video.',
              },
              {
                kind: 'update-clip-props',
                clipId: 'clip-beat-hook-text',
                props: {
                  text: 'City repo to launch video',
                  emphasis: 'agent-edited hook',
                },
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
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'apply-timeline-revision',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            previewPlan: expect.objectContaining({
              storyboard: [
                expect.objectContaining({
                  beatId: 'beat-hook',
                  narration: 'Tong turns a city repo into a launch-ready language video.',
                }),
                ...Array(5).fill(expect.any(Object)),
              ],
            }),
          }),
        }),
      ],
      finalProject: {
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-revision-agent-hook-tighten',
            kind: 'revision',
            inputRefs: ['beat-hook', 'clip-beat-hook-text'],
            outputRefs: ['beat-hook', 'clip-beat-hook-text'],
            status: 'done',
          }),
        ]),
      },
    });

    const hookClip = json.finalProject.tracks
      .flatMap((track: { clips: unknown[] }) => track.clips)
      .find((clip: { id?: string }) => clip.id === 'clip-beat-hook-text');
    expect(hookClip).toMatchObject({
      props: expect.objectContaining({
        text: 'City repo to launch video',
        emphasis: 'agent-edited hook',
      }),
      provenance: expect.arrayContaining([
        { kind: 'manual', ref: 'agent-hook-tighten' },
        { kind: 'revision', ref: 'agent-hook-tighten' },
      ]),
    });
  });

  it('applies edited source files through the source-edit handoff template', async () => {
    const startJson = await startLocalRepoProject();
    const plan = buildMotionRenderPlan(startJson.project, {
      engine: 'remotion',
      requestedAt: 831,
    });
    if (plan.status !== 'ready') throw new Error('expected render-ready project');
    const renderRequest = buildMotionRenderRequest(startJson.project, plan);
    const timelineFile = renderRequest.sourceFiles?.find(
      (file) => file.path === 'timeline/draft-primary.json'
    );
    if (!timelineFile) throw new Error('missing editable timeline file');

    const timeline = JSON.parse(timelineFile.contents);
    const cue = timeline.syncEffectCues.find(
      (candidate: { id?: string }) =>
        candidate.id === 'effect-clip-transition-beat-proof-to-beat-demo'
    );
    if (!cue) throw new Error('missing sync effect cue');
    cue.label = 'Agent-edited transition proof';
    cue.effectPresetId = 'proof-pulse';
    cue.durationSeconds = 0.5;

    const { POST } = await import('@/app/api/motion/agent-handoff/route');
    const res = await POST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: startJson.agentHandoff,
          project: startJson.project,
          templateIds: ['edit-source'],
          input: {
            editedSourceFiles: [
              {
                path: timelineFile.path,
                contents: JSON.stringify(timeline),
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
      status: 'complete',
      steps: [
        expect.objectContaining({
          templateId: 'edit-source',
          status: 'complete',
          responseStatus: 200,
          responseJson: expect.objectContaining({
            ok: true,
            status: 'applied',
          }),
        }),
      ],
    });
    const editedClip = json.finalProject.tracks
      .flatMap((track: { clips: unknown[] }) => track.clips)
      .find(
        (clip: { id?: string }) => clip.id === 'clip-transition-beat-proof-to-beat-demo'
      );
    expect(editedClip).toMatchObject({
      props: {
        effectPreset: 'proof-pulse',
        syncEffectCueOverrides: [
          expect.objectContaining({
            id: 'effect-clip-transition-beat-proof-to-beat-demo',
            label: 'Agent-edited transition proof',
            effectPresetId: 'proof-pulse',
            durationSeconds: 0.5,
          }),
        ],
      },
    });
  });
});
