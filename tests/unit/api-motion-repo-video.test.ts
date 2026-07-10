import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertGoldenPathMotionProject,
  buildRepoVideoGoldenPathFixture,
} from '@/lib/motion/goldenPathFixtures';
import { resetConfiguredMotionImageToVideoProvidersForTests } from '@/lib/providers/video/configured-generation';
import { resetConfiguredMotionRenderProvidersForTests } from '@/lib/providers/video/configured-render';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import type { CaptureRequest, CaptureResult } from '@/lib/providers/capture/types';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
  MotionRenderProvider,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';
import { resetConfiguredVoiceProvidersForTests } from '@/lib/providers/voice/configured';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
import { registerCodeChangeProvider } from '@/lib/providers/code-change/registry';
import type { CodeChangeProvider } from '@/lib/providers/code-change/types';
import type {
  VoiceProvider,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';

const unregister: Array<() => void> = [];

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
            id: `repo-video-${request.mode}`,
            kind:
              request.mode === 'screen-recording'
                ? 'recording'
                : request.mode === 'dom-snapshot'
                  ? 'snapshot'
                  : 'screenshot',
            assetUrl: `asset://repo-video/${request.mode}${
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

afterEach(() => {
  while (unregister.length > 0) unregister.pop()?.();
  resetConfiguredMotionImageToVideoProvidersForTests();
  resetConfiguredMotionRenderProvidersForTests();
  resetConfiguredVoiceProvidersForTests();
});

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

describe('POST /api/motion/repo-video', () => {
  it('uses the local code-change provider for a public PR source', async () => {
    const ingest = vi.fn<CodeChangeProvider['ingest']>(async () => ({
      providerId: 'github-gh-test',
      title: 'Make the timeline editable',
      author: { name: 'Ernie' },
      files: [
        {
          path: 'components/workspace/TimelineLens.tsx',
          status: 'modified',
          additions: 42,
          deletions: 8,
          language: 'TypeScript',
        },
      ],
      hunks: [
        {
          id: 'hunk-timeline-1',
          filePath: 'components/workspace/TimelineLens.tsx',
          oldStart: 10,
          newStart: 10,
          lines: ['+export function MotionEditor() {}'],
          provenance: [{ kind: 'code-change', ref: 'diff:TimelineLens.tsx#10' }],
        },
      ],
      commits: [{ sha: 'abc123', message: 'feat: make timeline editable' }],
      reviews: [],
      ci: [{ name: 'tests', status: 'passed' }],
      provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#175' }],
    }));
    unregister.push(
      registerCodeChangeProvider('github-gh-test', () => ({
        id: 'github-gh-test',
        displayName: 'GitHub CLI test',
        available: () => true,
        ingest,
      }))
    );

    const { POST } = await import('@/app/api/motion/repo-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/repo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          prRef: 'https://github.com/erniesg/aether/pull/175',
          intent: 'pr',
          mode: 'review',
          audience: 'builders and creators',
          tone: 'clear, visual, product-led',
          appProfile: {
            name: 'aether',
            summary: 'Canvas-native creative system.',
            stack: ['TypeScript', 'Next.js'],
          },
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      project: {
        brief: { projectKind: 'pr' },
        workflowMode: 'review',
      },
      start: {
        status: 'ready',
        previewPlan: { summary: { projectKind: 'pr' } },
      },
      run: null,
    });
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it('starts a repo video and runs the full-auto pre-cut chain in one request', async () => {
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

    const fixture = await buildRepoVideoGoldenPathFixture({
      appName: 'tong',
      description: 'City-specific language learning app.',
      audience: 'language learners',
      tone: 'textural',
      createdAt: 820,
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      requestedEngines: ['remotion', 'hyperframes'],
    });

    const { POST } = await import('@/app/api/motion/repo-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/repo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fixture.startRequest,
          imageToVideoProviderId: 'image-video-test',
          voiceProviderId: 'voice-test',
          renderProviderId: 'remotion-test',
        }),
      })
    );

    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      project: { id: 'motion-tong-golden-path' },
      start: {
        ok: true,
        project: { id: 'motion-tong-golden-path' },
      },
      run: {
        ok: true,
        status: 'complete',
        finalResponse: {
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
      },
    });
    assertGoldenPathMotionProject({
      project: json.project,
      agentHandoff: json.start.agentHandoff,
      requireFullAutoReceipts: true,
      fullAutoReviewPacket: json.run.finalResponse.run.reviewPacket,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
  }, 20000);

  it('returns a reviewable project without running full-auto in review mode', async () => {
    const fixture = await buildRepoVideoGoldenPathFixture({
      appName: 'tong',
      description: 'City-specific language learning app.',
      mode: 'review',
    });

    const { POST } = await import('@/app/api/motion/repo-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/repo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixture.startRequest),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      project: { workflowMode: 'review' },
      run: null,
    });
  });

  it('can produce a draft pre-cut without configured external providers', async () => {
    const fixture = await buildRepoVideoGoldenPathFixture({
      appName: 'tong',
      description: 'City-specific language learning app.',
      audience: 'language learners',
      tone: 'textural',
      createdAt: 920,
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      requestedEngines: ['remotion'],
    });

    const { POST } = await import('@/app/api/motion/repo-video/route');
    const res = await POST(
      new Request('http://localhost/api/motion/repo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixture.startRequest),
      })
    );

    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: 'complete',
      project: { id: 'motion-tong-golden-path' },
      run: {
        status: 'complete',
        finalResponse: {
          run: {
            status: 'complete',
            reason: null,
          },
        },
      },
    });
    assertGoldenPathMotionProject({
      project: json.project,
      agentHandoff: json.start.agentHandoff,
      requireFullAutoReceipts: true,
      fullAutoReviewPacket: json.run.finalResponse.run.reviewPacket,
    });
    expect(json.project.graphNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'render',
          providerId: 'aether-draft-render',
          status: 'done',
        }),
      ])
    );
  }, 20000);
});
