import { describe, expect, it } from 'vitest';
import {
  buildAgentMotionWorkflowPlan,
  type MotionWorkflowPlanSourceRef,
} from './workflowPlan';

const repoSource: MotionWorkflowPlanSourceRef = {
  kind: 'repo',
  ref: 'https://github.com/erniesg/aether',
  label: 'aether repo',
};

const prSource: MotionWorkflowPlanSourceRef = {
  kind: 'pr',
  ref: 'https://github.com/erniesg/aether/pull/123',
  label: 'PR #123',
};

describe('buildAgentMotionWorkflowPlan', () => {
  it('turns repo launch workflow metadata into a reviewable agent plan', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'review',
      sourceRefs: [repoSource],
      createdAt: 100,
    });

    expect(plan).toMatchObject({
      workflowId: 'repo-launch-video',
      label: 'Repo launch video',
      artifactKind: 'video',
      mode: 'review',
      primaryAction: 'request-review',
      sourceStatus: 'ready',
      createdAt: 100,
    });
    expect(plan.engines).toEqual(['remotion', 'hyperframes', 'provider']);
    expect(plan.acceptedSources).toEqual([repoSource]);
    expect(plan.unsupportedSources).toEqual([]);
    expect(plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'capture',
      'voice',
      'timeline',
      'render',
      'export',
    ]);
    expect(plan.gates.find((gate) => gate.id === 'capture')).toMatchObject({
      autoAdvance: false,
      toolIds: ['motion-capture'],
      expectedArtifacts: ['captures', 'cursor targets', 'crop receipts'],
    });
    expect(plan.gates.find((gate) => gate.id === 'voice')).toMatchObject({
      autoAdvance: false,
      toolIds: ['motion-voice'],
      expectedArtifacts: ['voice clips', 'word timings'],
    });
    expect(plan.skillContract).toMatchObject({
      runModes: ['review', 'full-auto'],
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'capture-plan',
        'sync-plan',
        'render-proof',
        'export-pack',
      ],
      regenerationTargets: [
        'story-beat',
        'component',
        'capture',
        'caption',
        'voice-line',
        'timing',
        'effect',
        'whole-video',
      ],
    });
    expect(plan.nextActions.map((action) => action.id)).toEqual([
      'review-video-plan',
      'review-draft-variations',
      'collect-captures',
      'generate-voice',
      'open-timeline',
      'render-proof',
      'export-pack',
    ]);
    expect(plan.gates.map((gate) => gate.label).join(' ')).not.toMatch(
      /pipeline|operator|dashboard|control plane/i
    );
  });

  it('keeps PR-to-video on code-change evidence without capture gates', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'pr-to-video',
      mode: 'full-auto',
      sourceRefs: [prSource],
      requestedEngines: ['hyperframes'],
      createdAt: 110,
    });

    expect(plan).toMatchObject({
      workflowId: 'pr-to-video',
      mode: 'full-auto',
      primaryAction: 'run-full-auto',
      sourceStatus: 'ready',
    });
    expect(plan.engines).toEqual(['hyperframes']);
    expect(plan.toolIds).toEqual([
      'motion-brief',
      'motion-storyboard',
      'motion-voice',
      'motion-sync',
      'motion-render',
      'motion-revise',
    ]);
    expect(plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'voice',
      'timeline',
      'render',
      'export',
    ]);
    expect(plan.gates.every((gate) => gate.autoAdvance)).toBe(true);
    expect(plan.gates.some((gate) => gate.id === 'capture')).toBe(false);
    expect(plan.gates.find((gate) => gate.id === 'voice')).toMatchObject({
      toolIds: ['motion-voice'],
      expectedArtifacts: ['voice clips', 'word timings'],
    });
    expect(plan.gates.find((gate) => gate.id === 'timeline')).toMatchObject({
      toolIds: ['motion-sync', 'motion-revise'],
    });
    expect(plan.skillContract).toMatchObject({
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'sync-plan',
        'render-proof',
        'export-pack',
      ],
      regenerationTargets: [
        'story-beat',
        'component',
        'code-proof',
        'caption',
        'voice-line',
        'timing',
        'effect',
        'whole-video',
      ],
    });
    expect(plan.nextActions[0]).toMatchObject({
      id: 'run-full-auto',
      label: 'Run saved gates',
    });
  });

  it('reports missing or unsupported sources before tool execution', () => {
    const missing = buildAgentMotionWorkflowPlan({
      workflowId: 'website-to-video',
      mode: 'review',
      sourceRefs: [],
      createdAt: 120,
    });
    expect(missing).toMatchObject({
      sourceStatus: 'missing',
      primaryAction: 'request-source',
      missingSourceKinds: ['site', 'capture', 'reference'],
    });
    expect(missing.gates).toEqual([]);
    expect(missing.nextActions).toEqual([
      {
        id: 'add-source',
        label: 'Add source',
        gateId: 'plan',
      },
    ]);

    const unsupported = buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'review',
      sourceRefs: [prSource],
      createdAt: 130,
    });
    expect(unsupported).toMatchObject({
      sourceStatus: 'unsupported',
      primaryAction: 'request-source',
      acceptedSources: [],
      unsupportedSources: [prSource],
      missingSourceKinds: ['repo', 'site', 'capture', 'reference'],
    });
  });

  it('fails closed for unknown or archived workflow ids', () => {
    expect(() =>
      buildAgentMotionWorkflowPlan({
        workflowId: 'unknown-video-workflow',
        mode: 'review',
        sourceRefs: [repoSource],
        createdAt: 140,
      })
    ).toThrow(/Motion workflow is not registered/);
  });
});
