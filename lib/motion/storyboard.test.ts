import { describe, expect, it } from 'vitest';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from './storyboard';

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

describe('buildCodeChangeMotionProject', () => {
  it('turns PR evidence into diff, mechanism, evidence, and CTA beats', () => {
    const project = buildCodeChangeMotionProject({
      id: 'motion-aether-pr-123',
      workspaceId: 'demo-ws',
      sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#123' },
      audience: 'builders reviewing a feature PR',
      tone: 'clear, technical, short-form',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js', 'TypeScript'],
      },
      codeChange: {
        providerId: 'github',
        title: 'Add repo video drafts',
        author: { name: 'Ernie' },
        files: [
          {
            path: 'lib/motion/storyboard.ts',
            status: 'modified',
            additions: 42,
            deletions: 4,
            language: 'TypeScript',
          },
        ],
        hunks: [
          {
            id: 'hunk-storyboard-builder',
            filePath: 'lib/motion/storyboard.ts',
            oldStart: 80,
            newStart: 92,
            lines: [
              '+export function buildCodeChangeMotionProject(input) {',
              '+  return createPrExplainer(input);',
            ],
            provenance: [{ kind: 'code-change', ref: 'diff:lib/motion/storyboard.ts' }],
          },
        ],
        commits: [{ sha: 'abc123', message: 'Add PR storyboard builder', authorName: 'Ernie' }],
        reviews: [{ reviewer: 'reviewer', state: 'approved' }],
        ci: [{ name: 'typecheck', status: 'passed' }],
        provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#123' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 45 }],
      createdAt: 20,
    });

    expect(project.brief.projectKind).toBe('pr');
    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'change',
      'diff',
      'mechanism',
      'evidence',
      'cta',
    ]);
    expect(project.story.map((beat) => beat.templateId)).toEqual([
      'hook-card',
      'proof-card',
      'code-diff-card',
      'mechanism-diagram',
      'evidence-card',
      'cta-card',
    ]);
    expect(project.story[2].narration).toContain('lib/motion/storyboard.ts');
    expect(project.story[2].provenance[0].ref).toBe('diff:lib/motion/storyboard.ts');
    expect(project.graphNodes.map((node) => node.kind)).toEqual([
      'pr-ingest',
      'script',
      'storyboard',
    ]);
    expect(project.graphNodes[0].inputRefs).toEqual(['erniesg/aether#123']);
  });

  it('returns reviewable PR draft variations before render work starts', () => {
    const project = buildCodeChangeMotionProject({
      id: 'motion-aether-pr-124',
      workspaceId: 'demo-ws',
      sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#124' },
      audience: 'maintainers',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript'],
      },
      codeChange: {
        providerId: 'github',
        title: 'Fix capture provider fallback',
        files: [],
        hunks: [],
        commits: [],
        reviews: [],
        ci: [],
        provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#124' }],
      },
      platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 60 }],
      createdAt: 30,
    });

    expect(project.currentDraftId).toBe('draft-pr-primary');
    expect(project.drafts.map((draft) => draft.id)).toEqual([
      'draft-pr-primary',
      'draft-pr-mechanism-first',
      'draft-pr-reviewer-cut',
    ]);
    expect(project.drafts.every((draft) => draft.status === 'planned')).toBe(true);
    expect(project.drafts.every((draft) => draft.story.length > 0)).toBe(true);
  });

  it('keeps mechanism beats grounded in code-change provenance, not screenshots', () => {
    const project = buildCodeChangeMotionProject({
      id: 'motion-aether-pr-125',
      workspaceId: 'demo-ws',
      sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#125' },
      audience: 'maintainers',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript'],
      },
      codeChange: {
        providerId: 'github',
        title: 'Refactor PR evidence flow',
        files: [
          {
            path: 'lib/providers/code-change/types.ts',
            status: 'added',
            additions: 76,
            deletions: 0,
          },
        ],
        hunks: [],
        commits: [],
        reviews: [],
        ci: [],
        provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#125' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 45 }],
      createdAt: 40,
    });
    const mechanism = project.story.find((beat) => beat.role === 'mechanism');

    expect(mechanism?.provenance.every((ref) => ref.kind === 'code-change')).toBe(true);
    expect(mechanism?.provenance.some((ref) => ref.kind === 'site')).toBe(false);
  });

  it('falls back to source PR provenance when provider receipts are not code-change evidence', () => {
    const project = buildCodeChangeMotionProject({
      id: 'motion-aether-pr-126',
      workspaceId: 'demo-ws',
      sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#126' },
      audience: 'maintainers',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript'],
      },
      codeChange: {
        providerId: 'github',
        title: 'Handle provider-only provenance',
        files: [],
        hunks: [],
        commits: [],
        reviews: [],
        ci: [],
        provenance: [{ kind: 'provider', ref: 'github' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 45 }],
      createdAt: 50,
    });

    expect(project.sourceRefs).toEqual([
      { kind: 'code-change', ref: 'github-pr:erniesg/aether#126' },
    ]);
    expect(project.story.every((beat) => beat.provenance[0].kind === 'code-change')).toBe(true);
  });
});
