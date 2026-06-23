import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';

describe('buildRepoLaunchMotionProject', () => {
  it('builds a launch story in hook/problem/proof/demo/payoff/cta order', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'Uses Next.js, Convex, and tldraw.',
          source: { kind: 'repo', ref: 'package.json#dependencies' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(project.story[0].templateId).toBe('hook-card');
    expect(project.story[2].provenance[0].ref).toBe('package.json#dependencies');
    expect(project.graphNodes.map((node) => node.kind)).toEqual([
      'repo-ingest',
      'script',
      'storyboard',
    ]);
  });

  it('does not invent numeric claims when the source claim has no number', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-tong-feature',
      workspaceId: 'demo-ws',
      projectKind: 'feature',
      audience: 'language learners',
      tone: 'textural',
      appProfile: {
        name: 'tong',
        summary: 'City-specific language learning app.',
        stack: ['React'],
      },
      claims: [
        {
          text: 'Tokyo uses physical ephemera as learning material.',
          source: { kind: 'manual', ref: 'creative-brief:tokyo' },
        },
      ],
      platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    const allNarration = project.story.map((beat) => beat.narration).join(' ');
    expect(allNarration).not.toMatch(/\b\d+%|\b\d+x|\b\d+ users/i);
    expect(allNarration).toContain('physical ephemera');
  });
});
