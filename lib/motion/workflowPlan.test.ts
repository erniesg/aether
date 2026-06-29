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
    expect(plan.supportedSourceKinds).toEqual(['repo', 'site', 'capture', 'reference']);
    expect(plan.acceptedSources).toEqual([repoSource]);
    expect(plan.unsupportedSources).toEqual([]);
    expect(plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'capture',
      'visuals',
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
    expect(plan.gates.find((gate) => gate.id === 'visuals')).toMatchObject({
      autoAdvance: false,
      toolIds: ['motion-visuals'],
      expectedArtifacts: ['reference requests', 'key still prompts', 'source asset picks'],
    });
    expect(plan.skillContract).toMatchObject({
      runModes: ['review', 'full-auto'],
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'capture-plan',
        'visual-source-plan',
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
      'review-visual-sources',
      'generate-voice',
      'open-timeline',
      'render-proof',
      'export-pack',
    ]);
    expect(plan.runPlan).toMatchObject({
      mode: 'review',
      status: 'ready',
      primaryAction: 'request-review',
      nextStepId: 'step-plan',
      stepCount: 8,
    });
    expect(plan.runPlan.steps.map((step) => step.id)).toEqual([
      'step-plan',
      'step-drafts',
      'step-capture',
      'step-visuals',
      'step-voice',
      'step-timeline',
      'step-render',
      'step-export',
    ]);
    expect(plan.runPlan.steps[0]).toMatchObject({
      id: 'step-plan',
      gateId: 'plan',
      label: 'Video plan',
      reviewRequired: true,
      autoAdvance: false,
      apiRoutes: ['/api/motion/start'],
      toolIds: ['motion-brief'],
      expectedArtifacts: ['grounded brief', 'video plan', 'source receipts'],
    });
    expect(plan.runPlan.steps.find((step) => step.gateId === 'capture')).toMatchObject({
      apiRoutes: ['/api/motion/capture'],
      outputSummary: ['captures', 'cursor targets', 'crop receipts'],
    });
    expect(plan.runPlan.steps.find((step) => step.gateId === 'visuals')).toMatchObject({
      apiRoutes: ['/api/motion/visuals'],
      outputSummary: ['reference requests', 'key still prompts', 'source asset picks'],
    });
    expect(plan.runPlan.steps.find((step) => step.gateId === 'timeline')).toMatchObject({
      apiRoutes: [
        '/api/motion/sync',
        '/api/motion/revise',
        '/api/motion/preview-source',
        '/api/motion/source-author',
        '/api/motion/source-edit',
      ],
      inputSummary: ['voice clips', 'word timings'],
    });
    expect(plan.runPlan.verificationArtifacts).toEqual([
      'contact-sheet',
      'mp4-probe',
      'poster',
      'subtitles',
      'transcript',
      'provenance-manifest',
    ]);
    expect(plan.skillDraft).toMatchObject({
      label: 'Repo launch video',
      manifestPathRelative: 'lib/agent/skills/repo-launch-video/SKILL.md',
      startShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
      manifest: {
        name: 'repo-launch-video',
        tools: expect.arrayContaining([
          'motion_start',
          'motion_capture',
          'motion_visuals',
          'motion_preview_source',
          'motion_source_author',
          'motion_source_edit',
          'motion_render',
        ]),
      },
    });
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
    expect(plan.supportedSourceKinds).toEqual(['pr', 'repo']);
    expect(plan.toolIds).toEqual([
      'motion-brief',
      'motion-storyboard',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ]);
    expect(plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'visuals',
      'voice',
      'timeline',
      'render',
      'export',
    ]);
    expect(plan.gates.every((gate) => gate.autoAdvance)).toBe(true);
    expect(plan.gates.some((gate) => gate.id === 'capture')).toBe(false);
    expect(plan.gates.find((gate) => gate.id === 'visuals')).toMatchObject({
      toolIds: ['motion-visuals'],
      expectedArtifacts: ['reference requests', 'key still prompts', 'source asset picks'],
    });
    expect(plan.gates.find((gate) => gate.id === 'voice')).toMatchObject({
      toolIds: ['motion-voice'],
      expectedArtifacts: ['voice clips', 'word timings'],
    });
    expect(plan.gates.find((gate) => gate.id === 'timeline')).toMatchObject({
      toolIds: [
        'motion-sync',
        'motion-revise',
        'motion-preview-source',
        'motion-source-author',
        'motion-source-edit',
      ],
    });
    expect(plan.gates.find((gate) => gate.id === 'export')).toMatchObject({
      toolIds: ['motion-export-pack'],
      expectedArtifacts: ['export pack', 'canvas drop candidates', 'pack manifest'],
    });
    expect(plan.skillContract).toMatchObject({
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'visual-source-plan',
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
    expect(plan.runPlan).toMatchObject({
      mode: 'full-auto',
      status: 'ready',
      primaryAction: 'run-full-auto',
      nextStepId: 'step-plan',
      stepCount: 7,
    });
    expect(plan.runPlan.steps.every((step) => step.autoAdvance)).toBe(true);
    expect(plan.runPlan.steps.every((step) => step.reviewRequired)).toBe(false);
    expect(plan.runPlan.steps.map((step) => step.gateId)).toEqual([
      'plan',
      'drafts',
      'visuals',
      'voice',
      'timeline',
      'render',
      'export',
    ]);
    expect(plan.runPlan.steps.some((step) => step.gateId === 'capture')).toBe(false);
    expect(plan.runPlan.steps.find((step) => step.gateId === 'visuals')).toMatchObject({
      apiRoutes: ['/api/motion/visuals'],
      outputSummary: ['reference requests', 'key still prompts', 'source asset picks'],
    });
    expect(plan.runPlan.steps.find((step) => step.gateId === 'voice')).toMatchObject({
      apiRoutes: ['/api/motion/voice'],
      outputSummary: ['voice clips', 'word timings'],
    });
    expect(plan.runPlan.steps.find((step) => step.gateId === 'timeline')).toMatchObject({
      apiRoutes: [
        '/api/motion/sync',
        '/api/motion/revise',
        '/api/motion/preview-source',
        '/api/motion/source-author',
        '/api/motion/source-edit',
      ],
    });
    expect(plan.skillDraft).toMatchObject({
      label: 'PR to video',
      manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
      startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
      manifest: {
        name: 'pr-to-video',
        tools: [
          'motion_start',
          'motion_agent_handoff',
          'motion_regenerate',
          'motion_visuals',
          'motion_voice',
          'motion_sync',
          'motion_revise',
          'motion_preview_source',
          'motion_source_author',
          'motion_source_edit',
          'motion_render',
          'motion_export_pack',
        ],
      },
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
    expect(missing.runPlan).toMatchObject({
      status: 'needs-source',
      primaryAction: 'request-source',
      nextStepId: 'step-source',
      stepCount: 1,
      steps: [
        {
          id: 'step-source',
          gateId: 'source',
          label: 'Add source',
          reviewRequired: true,
          autoAdvance: false,
          toolIds: [],
          apiRoutes: ['/api/motion/start'],
          expectedArtifacts: ['site source', 'capture source', 'reference source'],
        },
      ],
    });

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
