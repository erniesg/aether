import { describe, expect, it } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import type { MotionRenderResult } from '@/lib/providers/video/types';
import { applyCaptureResultToMotionProject } from './captureApply';
import { buildMotionProductionPlan } from './productionPlan';
import { applyMotionRenderResultToMotionProject } from './renderApply';
import { buildMotionRenderPlan } from './renderPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project(mode: 'review' | 'full-auto' = 'review') {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: mode,
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
          {
            id: 'record-hosted-flow',
            label: 'Record aether product flow',
            mode: 'screen-recording',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Demo scenes need a product flow.',
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

function approvedProject() {
  const base = project();
  return materializeMotionTimeline(
    {
      ...base,
      drafts: base.drafts.map((draft) =>
        draft.id === base.currentDraftId ? { ...draft, status: 'approved' as const } : draft
      ),
    },
    { draftId: base.currentDraftId, updatedAt: 122 }
  );
}

const captureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-aether-homepage',
      kind: 'screenshot',
      assetUrl: 'asset://captures/aether-homepage.png',
      mimeType: 'image/png',
      width: 1440,
      height: 1200,
      viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
      cursorTargets: [],
      provenance: [{ kind: 'capture', ref: 'capture-hosted-still' }],
    },
    {
      id: 'recording-aether-flow',
      kind: 'recording',
      assetUrl: 'asset://captures/aether-flow.mp4',
      mimeType: 'video/mp4',
      width: 1440,
      height: 1200,
      viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
      cursorTargets: [],
      durationMs: 6000,
      provenance: [{ kind: 'capture', ref: 'record-hosted-flow' }],
    },
  ],
  provenance: [{ kind: 'provider', ref: 'browser-capture' }],
};

function renderedAsset(
  kind: MotionRenderResult['outputs'][number]['kind']
): MotionRenderResult['outputs'][number] {
  const extension =
    kind === 'video'
      ? 'mp4'
      : kind === 'poster'
        ? 'png'
        : kind === 'manifest'
          ? 'json'
          : kind === 'subtitle'
            ? 'vtt'
            : 'txt';

  return {
    id: `render-export-x-9x16-${kind}`,
    exportId: 'export-x-9x16',
    kind,
    platform: 'x',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    mimeType: kind === 'video' ? 'video/mp4' : 'application/octet-stream',
    path: `renders/motion-aether-launch/export-x-9x16/${kind}.${extension}`,
    assetUrl: `asset://renders/x/${kind}.${extension}`,
    provenance: [{ kind: 'provider', ref: 'hyperframes-local' }],
  };
}

function renderedProject() {
  const captured = applyCaptureResultToMotionProject(project('full-auto'), captureResult, {
    updatedAt: 260,
  });
  const renderPlan = buildMotionRenderPlan(captured, {
    engine: 'hyperframes',
    requestedAt: 270,
  });
  const withRenderPlan = {
    ...captured,
    graphNodes: renderPlan.renderNode
      ? [...captured.graphNodes, renderPlan.renderNode]
      : captured.graphNodes,
  };

  return applyMotionRenderResultToMotionProject(
    withRenderPlan,
    {
      providerId: 'hyperframes-local',
      engine: 'hyperframes',
      outputs: [
        renderedAsset('video'),
        renderedAsset('poster'),
        renderedAsset('subtitle'),
        renderedAsset('transcript'),
        renderedAsset('manifest'),
      ],
      provenance: [{ kind: 'provider', ref: 'hyperframes-local' }],
    },
    { updatedAt: 280 }
  );
}

describe('buildMotionProductionPlan', () => {
  it('blocks review-mode production until the current draft variation is approved', () => {
    const unapproved = buildMotionProductionPlan(project(), {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 200,
    });

    expect(unapproved).toMatchObject({
      nextStepId: 'drafts',
      nextActionLabel: 'Review draft variations',
    });
    expect(unapproved.steps.find((step) => step.id === 'drafts')).toMatchObject({
      status: 'review',
      reviewRequired: true,
    });
    expect(unapproved.steps.find((step) => step.id === 'capture')).toMatchObject({
      status: 'blocked',
      blockerLabels: ['Approve a draft variation before product capture'],
    });
    expect(unapproved.steps.find((step) => step.id === 'visual-source')).toMatchObject({
      status: 'blocked',
      blockerLabels: ['Approve a draft variation before visual sourcing'],
    });
    expect(unapproved.steps.find((step) => step.id === 'voice')).toMatchObject({
      status: 'blocked',
      blockerLabels: ['Approve a draft variation before voice and caption work'],
    });

    const approved = buildMotionProductionPlan(approvedProject(), {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 201,
    });

    expect(approved).toMatchObject({
      nextStepId: 'capture',
      nextActionLabel: 'Capture product material',
    });
    expect(approved.steps.find((step) => step.id === 'drafts')).toMatchObject({
      status: 'complete',
      reviewRequired: false,
    });
    expect(approved.steps.find((step) => step.id === 'capture')).toMatchObject({
      status: 'ready',
    });
    expect(approved.steps.find((step) => step.id === 'visual-source')).toMatchObject({
      status: 'ready',
    });
    expect(approved.steps.find((step) => step.id === 'voice')).toMatchObject({
      status: 'ready',
    });
  });

  it('summarizes the gated review-mode queue from a concrete motion project', () => {
    const plan = buildMotionProductionPlan(project(), {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 200,
    });

    expect(plan).toMatchObject({
      id: 'production-plan-motion-aether-launch-draft-primary-200',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      mode: 'review',
      status: 'ready',
      nextStepId: 'drafts',
      nextActionLabel: 'Review draft variations',
      completeCount: 1,
      readyCount: 1,
      blockedCount: 7,
      optionalCount: 0,
    });
    expect(plan.steps.map((step) => [step.id, step.status, step.reviewRequired])).toEqual([
      ['plan', 'complete', false],
      ['drafts', 'review', true],
      ['capture', 'blocked', true],
      ['visual-source', 'blocked', true],
      ['visual-generation', 'blocked', true],
      ['voice', 'blocked', true],
      ['sync', 'blocked', true],
      ['render', 'blocked', true],
      ['export', 'blocked', true],
    ]);
    expect(plan.steps.find((step) => step.id === 'capture')).toMatchObject({
      apiRoutes: ['/api/motion/capture'],
      toolIds: ['motion-capture'],
      providerRequirementLabels: ['browser capture', 'screen recording'],
      blockerLabels: ['Approve a draft variation before product capture'],
    });
    expect(plan.steps.find((step) => step.id === 'visual-source')).toMatchObject({
      apiRoutes: ['/api/motion/visuals'],
      toolIds: ['motion-visuals'],
      providerRequirementLabels: ['asset library', 'reference search', 'image generation'],
      blockerLabels: ['Approve a draft variation before visual sourcing'],
    });
    expect(plan.steps.find((step) => step.id === 'sync')?.blockerLabels).toEqual([
      'Approve a draft variation before timeline sync',
    ]);
    expect(plan.steps.find((step) => step.id === 'render')?.blockerLabels).toContain(
      'Approve a draft variation before render proof'
    );
  });

  it('marks review gates as auto-advanceable in full-auto mode once timeline exists', () => {
    const plan = buildMotionProductionPlan(project('full-auto'), {
      engines: ['hyperframes'],
      requestedAt: 201,
    });

    expect(plan).toMatchObject({
      mode: 'full-auto',
      nextStepId: 'capture',
      nextActionLabel: 'Capture product material',
    });
    expect(plan.steps.find((step) => step.id === 'drafts')).toMatchObject({
      status: 'complete',
      reviewRequired: false,
      autoAdvance: false,
    });
    expect(plan.steps.find((step) => step.id === 'capture')).toMatchObject({
      status: 'ready',
      reviewRequired: false,
      autoAdvance: true,
    });
    expect(plan.steps.find((step) => step.id === 'visual-source')).toMatchObject({
      status: 'ready',
      autoAdvance: true,
    });
    expect(plan.steps.find((step) => step.id === 'voice')).toMatchObject({
      status: 'ready',
      autoAdvance: true,
    });
  });

  it('surfaces capture and render verification receipts for full-auto completion proof', () => {
    const plan = buildMotionProductionPlan(renderedProject(), {
      engines: ['hyperframes'],
      requestedAt: 281,
    });

    expect(plan.steps.find((step) => step.id === 'capture')).toMatchObject({
      status: 'complete',
      autoAdvance: false,
      verificationReceipts: expect.arrayContaining([
        expect.objectContaining({
          kind: 'capture',
          ref: 'capture-aether-homepage',
          label: 'Screenshot',
          providerId: 'browser-capture',
        }),
        expect.objectContaining({
          kind: 'capture',
          ref: 'recording-aether-flow',
          label: 'Recording',
          providerId: 'browser-capture',
        }),
      ]),
    });
    expect(plan.steps.find((step) => step.id === 'render')).toMatchObject({
      status: 'complete',
      autoAdvance: false,
      verificationReceipts: expect.arrayContaining([
        expect.objectContaining({
          kind: 'render',
          ref: 'render-export-x-9x16-video',
          label: 'MP4',
          providerId: 'hyperframes-local',
        }),
        expect.objectContaining({
          kind: 'render',
          ref: 'render-export-x-9x16-poster',
          label: 'Poster',
          providerId: 'hyperframes-local',
        }),
        expect.objectContaining({
          kind: 'render',
          ref: 'render-export-x-9x16-manifest',
          label: 'Manifest',
          providerId: 'hyperframes-local',
        }),
      ]),
    });
    expect(plan.steps.find((step) => step.id === 'export')?.verificationReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'export',
          ref: 'export-pack-motion-aether-launch-draft-primary-manifest',
          label: 'Export pack manifest',
        }),
      ])
    );
  });
});
