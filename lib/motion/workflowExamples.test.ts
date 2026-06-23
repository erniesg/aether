import { describe, expect, it } from 'vitest';
import { listMotionWorkflowExamples } from './workflowExamples';

describe('listMotionWorkflowExamples', () => {
  it('keeps the daily skill launch pattern attached to PR-to-video', () => {
    const examples = listMotionWorkflowExamples('pr-to-video');

    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({
      id: 'daily-skill-launch-pr-to-video',
      workflowId: 'pr-to-video',
      label: 'Daily skill launch: PR-to-video',
      sourceKinds: ['pr', 'repo'],
      suggestedMode: 'review',
      platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
      storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
      reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
      editSurfaces: ['script', 'code-evidence', 'component', 'voice', 'timing', 'effect', 'export'],
    });
    expect(examples[0].beatPrompts).toContain(
      'Preview the generated video plan, timeline, and proof output.'
    );
    expect(examples[0].sampleCopyLines.join('\n')).toContain(
      'Nobody reads pull requests. Now agents can turn them into a short explainer video.'
    );
    expect(examples[0].sampleCopyLines.join('\n')).toContain(
      'npx skills add heygen-com/hyperframes'
    );
    expect(examples[0].sampleCopyLines.join(' ')).not.toMatch(
      /dashboard|operator|control plane/i
    );
  });

  it('returns isolated copies so callers can edit local drafts safely', () => {
    const [first] = listMotionWorkflowExamples('pr-to-video');
    first.sampleCopyLines[0] = 'changed locally';

    const [second] = listMotionWorkflowExamples('pr-to-video');
    expect(second.sampleCopyLines[0]).toBe(
      "This week we're launching new skills for HyperFrames, each built around a workflow."
    );
  });
});
