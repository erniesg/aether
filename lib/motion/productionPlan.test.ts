import { describe, expect, it } from 'vitest';
import { buildMotionProductionPlan } from './productionPlan';
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

describe('buildMotionProductionPlan', () => {
  it('summarizes the review-mode queue from a concrete motion project', () => {
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
      readyCount: 3,
      blockedCount: 3,
      optionalCount: 1,
    });
    expect(plan.steps.map((step) => [step.id, step.status, step.reviewRequired])).toEqual([
      ['plan', 'complete', false],
      ['drafts', 'review', true],
      ['capture', 'ready', true],
      ['visual-generation', 'optional', true],
      ['voice', 'ready', true],
      ['sync', 'blocked', true],
      ['render', 'blocked', true],
      ['export', 'blocked', true],
    ]);
    expect(plan.steps.find((step) => step.id === 'capture')).toMatchObject({
      apiRoutes: ['/api/motion/capture'],
      toolIds: ['motion-capture'],
      providerRequirementLabels: ['browser capture', 'screen recording'],
      blockerLabels: [],
    });
    expect(plan.steps.find((step) => step.id === 'sync')?.blockerLabels).toEqual([
      'Generate voice and word timings before final sync',
    ]);
    expect(plan.steps.find((step) => step.id === 'render')?.blockerLabels).toContain(
      'Review voice and caption sync before render'
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
    expect(plan.steps.find((step) => step.id === 'voice')).toMatchObject({
      status: 'ready',
      autoAdvance: true,
    });
  });
});
