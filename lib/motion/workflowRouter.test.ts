import { describe, expect, it } from 'vitest';
import {
  routeAgentMotionWorkflow,
  type RouteAgentMotionWorkflowInput,
} from './workflowRouter';

function route(input: Partial<RouteAgentMotionWorkflowInput>) {
  return routeAgentMotionWorkflow({
    mode: 'review',
    sourceRefs: [],
    createdAt: 200,
    ...input,
  });
}

describe('routeAgentMotionWorkflow', () => {
  it('defaults repo sources to the repo launch video workflow', () => {
    const result = route({
      sourceRefs: [
        {
          kind: 'repo',
          ref: 'https://github.com/erniesg/aether',
          label: 'aether',
        },
      ],
    });

    expect(result).toMatchObject({
      workflowId: 'repo-launch-video',
      reason: 'repo source selected a launch workflow',
    });
    expect(result.plan).toMatchObject({
      workflowId: 'repo-launch-video',
      sourceStatus: 'ready',
      primaryAction: 'request-review',
    });
    expect(result.plan.gates.map((gate) => gate.id)).toContain('capture');
  });

  it('routes pull request sources to PR-to-video without capture gates', () => {
    const result = route({
      intent: 'launch',
      mode: 'full-auto',
      sourceRefs: [
        { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        { kind: 'pr', ref: 'https://github.com/erniesg/aether/pull/123' },
      ],
      requestedEngines: ['hyperframes'],
    });

    expect(result.workflowId).toBe('pr-to-video');
    expect(result.reason).toBe('pull request source selected a code-change workflow');
    expect(result.plan).toMatchObject({
      workflowId: 'pr-to-video',
      mode: 'full-auto',
      primaryAction: 'run-full-auto',
      sourceStatus: 'ready',
      engines: ['hyperframes'],
    });
    expect(result.plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'visuals',
      'voice',
      'timeline',
      'render',
      'export',
    ]);
    expect(result.plan.gates.some((gate) => gate.id === 'capture')).toBe(false);
  });

  it('routes feature and social intents to the feature-social workflow', () => {
    const result = route({
      intent: 'social',
      sourceRefs: [
        { kind: 'repo', ref: 'https://github.com/erniesg/tong' },
        { kind: 'capture', ref: 'capture://tokyo-onboarding' },
      ],
    });

    expect(result.workflowId).toBe('feature-social-video');
    expect(result.reason).toBe('social intent selected a feature/social workflow');
    expect(result.plan.acceptedSources.map((source) => source.kind)).toEqual([
      'repo',
      'capture',
    ]);
  });

  it('routes site demos, caption overlays, motion graphics, and engine ports', () => {
    expect(
      route({
        intent: 'demo',
        sourceRefs: [{ kind: 'site', ref: 'https://aether.local/workspace/demo-ws' }],
      }).workflowId
    ).toBe('website-to-video');

    expect(
      route({
        intent: 'caption-overlay',
        sourceRefs: [{ kind: 'upload', ref: 'asset://clip.mp4' }],
      }).workflowId
    ).toBe('caption-overlay-video');

    expect(
      route({
        intent: 'motion-graphic',
        sourceRefs: [{ kind: 'reference', ref: 'moodboard://launch-style' }],
      }).workflowId
    ).toBe('motion-graphic-video');

    expect(
      route({
        sourceRefs: [{ kind: 'remotion', ref: 'remotion://launch-composition' }],
      }).workflowId
    ).toBe('remotion-hyperframes-port');
  });

  it('keeps missing-source starts reviewable instead of guessing a source', () => {
    const result = route({ intent: 'feature' });

    expect(result).toMatchObject({
      workflowId: 'feature-social-video',
      reason: 'feature intent selected a feature/social workflow',
    });
    expect(result.plan).toMatchObject({
      sourceStatus: 'missing',
      primaryAction: 'request-source',
      missingSourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
      gates: [],
      nextActions: [{ id: 'add-source', label: 'Add source', gateId: 'plan' }],
    });
  });
});
