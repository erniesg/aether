import { describe, expect, it } from 'vitest';
import { listMotionWorkflowExamples } from './workflowExamples';

describe('listMotionWorkflowExamples', () => {
  it('keeps the repo app launch pattern attached to repo launch videos', () => {
    const examples = listMotionWorkflowExamples('repo-launch-video');

    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({
      id: 'repo-app-launch-video',
      workflowId: 'repo-launch-video',
      label: 'Repo app launch',
      sourceKinds: ['repo', 'site', 'capture', 'reference'],
      suggestedMode: 'review',
      platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s', 'website 16:9 60s'],
      storyRoles: ['hook', 'problem', 'proof', 'demo', 'payoff', 'cta'],
      reusableComponentIds: ['hook-card', 'proof-card', 'app-frame', 'agent-trace', 'cta-card'],
      editSurfaces: [
        'script',
        'capture',
        'visual',
        'image-to-video',
        'component',
        'voice',
        'timing',
        'effect',
        'export',
      ],
    });
    expect(examples[0].beatPrompts).toContain(
      'Use captured app frames or generated visual inserts for the product flow.'
    );
  });

  it('keeps the feature social pattern attached to feature/social videos', () => {
    const examples = listMotionWorkflowExamples('feature-social-video');

    expect(examples).toEqual([
      expect.objectContaining({
        id: 'feature-social-cut',
        workflowId: 'feature-social-video',
        label: 'Feature social cut',
        storyRoles: ['hook', 'demo', 'proof', 'payoff', 'cta'],
        editSurfaces: expect.arrayContaining(['capture', 'image-to-video', 'timing']),
      }),
    ]);
    expect(examples[0].sampleCopyLines).toContain(
      'Export the square, vertical, and feed cuts from one editable timeline.'
    );
  });

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
    const [first] = listMotionWorkflowExamples('repo-launch-video');
    first.sampleCopyLines[0] = 'changed locally';

    const [second] = listMotionWorkflowExamples('repo-launch-video');
    expect(second.sampleCopyLines[0]).toBe(
      'Point Aether at the repo.'
    );
  });
});
