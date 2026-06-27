import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
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

describe('POST /api/motion/regenerate', () => {
  it('creates a scoped component regeneration request and refreshed plans', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh this app-frame capture with the latest canvas flow.',
          requestedAt: 950,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-clip-beat-demo-text-capture-950',
        projectId: 'motion-aether-launch',
        draftId: 'draft-primary',
        clipId: 'clip-beat-demo-text',
        componentId: 'app-frame',
        scope: 'capture',
        prompt: 'Refresh this app-frame capture with the latest canvas flow.',
        status: 'planned',
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 2,
          latestReceiptLabels: ['Regeneration request', 'Capture plan'],
          entries: [
            {
              id: 'execution-regeneration-app-frame-capture-950',
              gateId: 'drafts',
              label: 'Regenerate capture for App frame',
              receiptLabels: ['Regeneration request', 'Capture plan'],
            },
          ],
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
      capturePlan: {
        projectId: 'motion-aether-launch',
        status: 'needs-source',
      },
      project: {
        graphNodes: expect.arrayContaining([
          {
            id: 'node-regen-clip-beat-demo-text-capture-950',
            kind: 'revision',
            inputRefs: expect.arrayContaining(['clip-beat-demo-text', 'beat-demo']),
            outputRefs: ['regen-clip-beat-demo-text-capture-950'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-clip-beat-demo-text-capture-950' },
              { kind: 'timeline', ref: 'clip-beat-demo-text' },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-regeneration-app-frame-capture-950',
            gateId: 'drafts',
            label: 'Regenerate capture for App frame',
            savedAt: 950,
            receiptCount: 2,
            receiptLabels: ['Regeneration request', 'Capture plan'],
            receipts: [
              {
                id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-950-request',
                kind: 'revision',
                label: 'Regeneration request',
                ref: 'regen-clip-beat-demo-text-capture-950',
              },
              {
                id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-950-capture-plan',
                kind: 'revision',
                label: 'Capture plan',
                ref: 'regen-clip-beat-demo-text-capture-950:capture-plan',
              },
            ],
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-clip-beat-demo-text-capture-950' },
              { kind: 'timeline', ref: 'clip-beat-demo-text' },
            ]),
          },
        ],
      },
    });
    expect(json.regenerationRequest.inputRefs).toContain('clip-beat-demo-text');
    expect(json.regenerationRequest.inputRefs).toContain('beat-demo');
    expect(json.regenerationRequest.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'clip-beat-demo-text',
    });
  });

  it('creates a reference-backed regeneration request and refreshed preview actions', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          referenceSignalId: 'hyperframes-launch-video-gallery',
          sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
          scope: 'effect',
          componentIds: ['hook-card', 'app-frame'],
          prompt: 'Apply source-backed launch-video style to the hook and app frame.',
          requestedAt: 970,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-reference-hyperframes-launch-video-gallery-effect-970',
        projectId: 'motion-aether-launch',
        draftId: 'draft-primary',
        referenceSignalId: 'hyperframes-launch-video-gallery',
        referenceTitle: 'HyperFrames launch video source gallery',
        sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
        scope: 'effect',
        componentIds: ['hook-card', 'app-frame'],
        componentLabels: ['Hook card', 'App frame'],
        status: 'planned',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        referenceSignals: expect.arrayContaining([
          expect.objectContaining({
            id: 'hyperframes-launch-video-gallery',
            actions: expect.arrayContaining([
              expect.objectContaining({
                id: 'reference-signal-hyperframes-launch-video-gallery-effect',
                label: 'Apply reference style to Hook card / App frame',
              }),
            ]),
          }),
        ]),
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 2,
          latestReceiptLabels: ['Reference signal', 'Component style update'],
          entries: [
            {
              id: 'execution-reference-signal-hyperframes-launch-video-gallery-effect-970',
              gateId: 'drafts',
              label: 'Apply reference style to Hook card / App frame',
              receiptLabels: ['Reference signal', 'Component style update'],
            },
          ],
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
        ],
      },
      project: {
        graphNodes: expect.arrayContaining([
          {
            id: 'node-regen-reference-hyperframes-launch-video-gallery-effect-970',
            kind: 'revision',
            inputRefs: [
              'hyperframes-launch-video-gallery',
              'https://hyperframes.heygen.com/launch-videos',
              'hook-card',
              'app-frame',
            ],
            outputRefs: ['regen-reference-hyperframes-launch-video-gallery-effect-970'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-reference-hyperframes-launch-video-gallery-effect-970' },
              {
                kind: 'reference',
                ref: 'https://hyperframes.heygen.com/launch-videos',
                label: 'HyperFrames launch video source gallery',
              },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-reference-signal-hyperframes-launch-video-gallery-effect-970',
            gateId: 'drafts',
            label: 'Apply reference style to Hook card / App frame',
            savedAt: 970,
            receiptCount: 2,
            receiptLabels: ['Reference signal', 'Component style update'],
            receipts: [
              {
                id: 'receipt-reference-signal-regen-reference-hyperframes-launch-video-gallery-effect-970-reference',
                kind: 'revision',
                label: 'Reference signal',
                ref: 'hyperframes-launch-video-gallery',
              },
              {
                id: 'receipt-reference-signal-regen-reference-hyperframes-launch-video-gallery-effect-970-component-style-update',
                kind: 'revision',
                label: 'Component style update',
                ref: 'regen-reference-hyperframes-launch-video-gallery-effect-970:component-style-update',
              },
            ],
          },
        ],
      },
    });
    expect(json.regenerationRequest.inputRefs).toEqual([
      'hyperframes-launch-video-gallery',
      'https://hyperframes.heygen.com/launch-videos',
      'hook-card',
      'app-frame',
    ]);
  });

  it('rejects unsupported component scopes before creating a request', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'proof',
          prompt: 'Regenerate proof here.',
          requestedAt: 951,
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      code: 'motion_regeneration_failed',
    });
    expect(json.error).toMatch(/does not support proof regeneration/);
    expect(json.regenerationRequest).toBeUndefined();
  });

  it('rejects malformed regeneration requests', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const missingProject = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh the capture.',
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const missingPrompt = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
        }),
      })
    );
    expect(missingPrompt.status).toBe(400);
    expect(await missingPrompt.json()).toMatchObject({
      ok: false,
      error: 'clipId, scope, and prompt are required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh the capture.',
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
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
