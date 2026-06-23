import { describe, expect, it } from 'vitest';
import type { MotionWorkflowMode } from './project';
import {
  buildMotionReviewPlan,
  createMotionComponentRegenerationRequest,
} from './reviewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project(workflowMode: MotionWorkflowMode = 'review') {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode,
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
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('buildMotionReviewPlan', () => {
  it('turns a motion project into a reviewable video plan with drafts and editable component slots', () => {
    const plan = buildMotionReviewPlan(project());

    expect(plan.projectId).toBe('motion-aether-launch');
    expect(plan.workflowMode).toBe('review');
    expect(plan.primaryAction).toBe('request-review');
    expect(plan.summary).toMatchObject({
      appName: 'aether',
      projectKind: 'launch',
      totalSeconds: 30,
      targetPlatforms: ['x 9:16 30s'],
    });
    expect(plan.storyBeats.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(plan.drafts.map((draft) => draft.label)).toEqual([
      'Primary launch cut',
      'Proof-first cut',
      'Demo-first cut',
    ]);
    expect(plan.drafts[0]).toMatchObject({
      draftId: 'draft-primary',
      isCurrent: true,
      durationSeconds: 30,
      status: 'ready',
    });

    const demoSlot = plan.componentSlots.find(
      (slot) => slot.clipId === 'clip-beat-demo-text'
    );
    expect(demoSlot).toMatchObject({
      componentId: 'app-frame',
      componentLabel: 'App frame',
      trackKind: 'text',
      regenerateScopes: ['capture', 'timing', 'caption'],
    });
    expect(demoSlot?.editControls.map((control) => control.id)).toEqual([
      'assetId',
      'caption',
      'zoom',
    ]);
    expect(plan.componentSlots.some((slot) => slot.componentId === 'voice-line')).toBe(true);
    expect(plan.nextActions.map((action) => action.id)).toEqual([
      'review-story',
      'review-drafts',
      'regenerate-component',
      'approve-render',
    ]);
  });

  it('surfaces a full-auto action path without removing reviewable draft detail', () => {
    const plan = buildMotionReviewPlan(project('full-auto'));

    expect(plan.workflowMode).toBe('full-auto');
    expect(plan.primaryAction).toBe('queue-render');
    expect(plan.drafts).toHaveLength(3);
    expect(plan.componentSlots.length).toBeGreaterThan(0);
    expect(plan.nextActions.map((action) => action.id)).toEqual([
      'generate-visuals',
      'generate-voice',
      'sync-effects',
      'queue-render',
    ]);
  });
});

describe('createMotionComponentRegenerationRequest', () => {
  it('creates a scoped regeneration request for one editable component', () => {
    const request = createMotionComponentRegenerationRequest(project(), {
      clipId: 'clip-beat-demo-text',
      scope: 'capture',
      prompt: 'Refresh the product-flow capture with the current canvas.',
      requestedAt: 90,
    });

    expect(request).toMatchObject({
      id: 'regen-clip-beat-demo-text-capture-90',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      clipId: 'clip-beat-demo-text',
      componentId: 'app-frame',
      scope: 'capture',
      status: 'planned',
    });
    expect(request.inputRefs).toContain('clip-beat-demo-text');
    expect(request.inputRefs).toContain('beat-demo');
    expect(request.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'clip-beat-demo-text',
    });
  });

  it('rejects regeneration scopes that the component does not declare', () => {
    expect(() =>
      createMotionComponentRegenerationRequest(project(), {
        clipId: 'clip-beat-demo-text',
        scope: 'proof',
        prompt: 'Generate narration here.',
        requestedAt: 91,
      })
    ).toThrow(/does not support proof regeneration/);
  });
});
