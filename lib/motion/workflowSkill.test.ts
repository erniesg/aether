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
        'motion_visuals',
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
      agentTaskLabels: expect.arrayContaining([
        'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status',
      ]),
      draftVariationLabels: [
        'Daily skill launch',
        'Maintainer brief',
        'Mechanism-first cut',
      ],
      componentSlotLabels: [
        'Hook card',
        'Code diff card',
        'Mechanism diagram',
        'Evidence card',
        'CTA card',
      ],
      referencePatternLabels: [
        'Code diff explainer',
        'Proof receipt card',
        'Terminal command proof',
        'Voice and caption sync',
        'Multi-format export pack',
      ],
      regenerationLabels: expect.arrayContaining([
        'code proof',
        'Code diff card: code',
        'Mechanism diagram: diagram',
      ]),
      recipe: expect.objectContaining({
        slug: 'pr-to-video',
        generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render', 'export'],
        referencePatterns: [
          expect.objectContaining({
            id: 'code-diff-explainer',
            componentIds: ['code-diff-card', 'mechanism-diagram', 'evidence-card'],
          }),
          expect.objectContaining({
            id: 'proof-receipt-card',
          }),
          expect.objectContaining({
            id: 'terminal-command-proof',
          }),
          expect.objectContaining({
            id: 'voice-caption-sync',
          }),
          expect.objectContaining({
            id: 'multi-format-pack',
          }),
        ],
      }),
    });
    expect(plan.skillDraft.manifest).toMatchObject({
      name: 'pr-to-video',
      version: 1,
      description: 'PR to video skill for editable, provenance-rich motion videos.',
      tools: [
        'motion_start',
        'motion_regenerate',
        'motion_visuals',
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
    expect(plan.skillDraft.manifest.instructions).toContain('## Agent Tasks');
    expect(plan.skillDraft.manifest.instructions).toContain('## Draft Variations');
    expect(plan.skillDraft.manifest.instructions).toContain('Daily skill launch');
    expect(plan.skillDraft.manifest.instructions).toContain('## Component Regeneration');
    expect(plan.skillDraft.manifest.instructions).toContain('Code diff card');
    expect(plan.skillDraft.manifest.instructions).toContain('Regenerate: code, proof, timing');
    expect(plan.skillDraft.manifest.instructions).toContain('## Reference Patterns');
    expect(plan.skillDraft.manifest.instructions).toContain('Code diff explainer');
    expect(plan.skillDraft.manifest.instructions).toContain('Verify: diff is readable');
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
    expect(plan.skillDraft.draftVariationLabels).toEqual([
      'Proof-first launch',
      'Demo-first launch',
      'Founder-note launch',
    ]);
    expect(plan.skillDraft.componentSlotLabels).toEqual([
      'Hook card',
      'Proof card',
      'App frame',
      'Agent trace',
      'CTA card',
    ]);
    expect(plan.skillDraft.referencePatternLabels).toEqual([
      'Launch hook title',
      'Real product capture',
      'Screen zoom callout',
      'Proof receipt card',
      'Agent process trace',
      'Skill drop announcement',
      'Terminal command proof',
      'Image-to-video insert',
      'Voice and caption sync',
      'Multi-format export pack',
      'Branded template system',
      'Localized voice caption variants',
    ]);
    expect(plan.skillDraft.toolNames).toContain('motion_capture');
    expect(plan.skillDraft.manifest.instructions).toContain('Review video plan before continuing');
    expect(plan.skillDraft.manifest.instructions).toContain('repoPath');
    expect(plan.skillDraft.manifest.instructions).toContain('## Review Surfaces');
    expect(plan.skillDraft.manifest.instructions).toContain('## Research Signals');
    expect(plan.skillDraft.manifest.instructions).toContain('Screen Studio');
    expect(plan.skillDraft.manifest.instructions).toContain('Clueso');
    expect(plan.skillDraft.manifest.instructions).toContain('iart motion-skills');
    expect(plan.skillDraft.manifest.instructions).toContain('Real product capture');
    expect(plan.skillDraft.manifest.instructions).toContain('Capture plan');
    expect(plan.skillDraft.manifest.instructions).not.toMatch(
      /operator|dashboard|control plane/i
    );
  });
});
