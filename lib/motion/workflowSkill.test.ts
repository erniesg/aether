import { describe, expect, it } from 'vitest';
import { buildAgentMotionWorkflowPlan, type MotionWorkflowPlanSourceRef } from './workflowPlan';

const prSource: MotionWorkflowPlanSourceRef = {
  kind: 'pr',
  ref: 'erniesg/aether#456',
  label: 'Aether PR #456',
};

describe('motion workflow skill drafts', () => {
  it('turns a PR-to-video run plan into a reusable SKILL.md manifest', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'pr-to-video',
      mode: 'full-auto',
      sourceRefs: [prSource],
      requestedEngines: ['hyperframes'],
      createdAt: 200,
    });

    expect(plan.skillDraft).toMatchObject({
      kind: 'motion-workflow-skill-draft',
      label: 'PR to video',
      manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
      startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
      reviewPolicyLabels: expect.arrayContaining([
        'Auto-advance video plan after saving artifacts',
        'Auto-advance render proof after saving artifacts',
      ]),
      toolNames: [
        'motion_start',
        'motion_regenerate',
        'motion_voice',
        'motion_sync',
        'motion_revise',
        'motion_render',
        'motion_export_pack',
      ],
      verificationLabels: [
        'contact sheet',
        'mp4 probe',
        'poster',
        'subtitles',
        'transcript',
        'provenance manifest',
      ],
    });
    expect(plan.skillDraft.manifest).toMatchObject({
      name: 'pr-to-video',
      version: 1,
      description: 'PR to video skill for editable, provenance-rich motion videos.',
      tools: [
        'motion_start',
        'motion_regenerate',
        'motion_voice',
        'motion_sync',
        'motion_revise',
        'motion_render',
        'motion_export_pack',
      ],
      referenceFiles: [],
    });
    expect(plan.skillDraft.sampleCopyLines).toContain(
      'npx skills add heygen-com/hyperframes'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('## Input shape');
    expect(plan.skillDraft.manifest.instructions).toContain('/api/motion/render');
    expect(plan.skillDraft.manifest.instructions).toContain('## Output format');
    expect(plan.skillDraft.manifest.instructions).toContain('provenance manifest');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'npx skills add heygen-com/hyperframes'
    );
  });

  it('keeps review-mode launch skills gated for creator review', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'review',
      sourceRefs: [
        {
          kind: 'repo',
          ref: '/Users/erniesg/code/erniesg/tong',
          label: 'Tong repo',
        },
      ],
      createdAt: 201,
    });

    expect(plan.skillDraft.startShorthands).toEqual([
      'repoPath',
      'repoUrl',
      'siteUrl',
      'sourceRefs',
    ]);
    expect(plan.skillDraft.reviewPolicyLabels).toContain(
      'Review video plan before continuing'
    );
    expect(plan.skillDraft.toolNames).toContain('motion_capture');
    expect(plan.skillDraft.manifest.instructions).toContain('Review video plan before continuing');
    expect(plan.skillDraft.manifest.instructions).toContain('repoPath');
    expect(plan.skillDraft.manifest.instructions).not.toMatch(
      /operator|dashboard|control plane/i
    );
  });
});
