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

  it('defaults to review mode and returns draft variations before render', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-accrue-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'founders',
      tone: 'confident',
      appProfile: {
        name: 'accrue',
        summary: 'Founder-facing finance workflow.',
        stack: ['Next.js'],
      },
      claims: [
        {
          text: 'Turns repo facts into proof-backed launch material.',
          source: { kind: 'repo', ref: 'README.md#overview' },
        },
      ],
      platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
      createdAt: 10,
    });

    expect(project.workflowMode).toBe('review');
    expect(project.currentDraftId).toBe('draft-primary');
    expect(project.drafts.map((draft) => draft.id)).toEqual([
      'draft-primary',
      'draft-proof-first',
      'draft-demo-first',
    ]);
    expect(project.drafts.every((draft) => draft.status === 'planned')).toBe(true);
    expect(project.drafts.every((draft) => draft.story.length > 0)).toBe(true);
    expect(project.drafts.every((draft) => draft.provenance[0].kind === 'story-beat')).toBe(true);
  });

  it('can run full-auto without removing editable drafts', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-paillette-feature',
      workspaceId: 'demo-ws',
      projectKind: 'feature',
      workflowMode: 'full-auto',
      audience: 'curators',
      tone: 'visual',
      appProfile: {
        name: 'paillette',
        summary: 'Open-access art search with provenance.',
        stack: ['Cloudflare', 'React'],
      },
      claims: [
        {
          text: 'Keeps provenance attached to search and showcase outputs.',
          source: { kind: 'repo', ref: 'docs/provenance.md' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    expect(project.workflowMode).toBe('full-auto');
    expect(project.currentDraftId).toBe('draft-primary');
    expect(project.drafts).toHaveLength(3);
    expect(project.exports[0].status).toBe('planned');
  });
});
