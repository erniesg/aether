import { describe, expect, it } from 'vitest';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from './storyboard';
import { buildMotionVisualSourcingPlan } from './visualSourcingPlan';

function repoProject() {
  return buildRepoLaunchMotionProject({
    id: 'motion-aether-launch',
    workspaceId: 'demo-ws',
    projectKind: 'launch',
    audience: 'creative app builders',
    tone: 'precise',
    appProfile: {
      name: 'aether',
      repoUrl: 'https://github.com/erniesg/aether',
      siteUrl: 'https://aether.example',
      summary: 'Canvas-native creative system.',
      stack: ['TypeScript', 'Convex', 'tldraw'],
    },
    claims: [
      {
        text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
        source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      },
    ],
    sourceProfile: {
      kind: 'github-repo',
      label: 'aether source material',
      sourceRef: 'https://github.com/erniesg/aether',
      summary: 'GitHub repo with hosted capture candidates',
      signals: [
        {
          id: 'signal-stack',
          label: 'Stack',
          value: 'TypeScript, Convex, tldraw',
          provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
        },
      ],
      captureCandidates: [
        {
          id: 'capture-home',
          label: 'Capture aether homepage',
          mode: 'screenshot',
          targetKind: 'url',
          targetRef: 'https://aether.example',
          reason: 'Hosted site is available as product evidence.',
          provenance: [{ kind: 'site', ref: 'https://aether.example' }],
        },
      ],
      storyboardHints: [
        {
          id: 'hint-demo',
          beatRole: 'demo',
          label: 'Capture aether homepage',
          reason: 'Use a real product surface.',
          provenance: [{ kind: 'site', ref: 'https://aether.example' }],
        },
      ],
      provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
    },
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    createdAt: 10,
  });
}

function prProject() {
  return buildCodeChangeMotionProject({
    id: 'motion-aether-pr',
    workspaceId: 'demo-ws',
    sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#456' },
    audience: 'developers',
    tone: 'editorial',
    appProfile: {
      name: 'aether',
      summary: 'Canvas-native creative system.',
      stack: ['TypeScript'],
    },
    codeChange: {
      providerId: 'github-gh',
      title: 'Add pr-to-video workflow signal',
      files: [
        {
          path: 'lib/motion/workflowSkillCatalog.ts',
          status: 'modified',
          additions: 42,
          deletions: 4,
          language: 'TypeScript',
        },
      ],
      hunks: [
        {
          id: 'hunk-workflow-catalog',
          filePath: 'lib/motion/workflowSkillCatalog.ts',
          lines: ['+ sampleCopyLines: ["npx skills add heygen-com/hyperframes"]'],
          provenance: [{ kind: 'code-change', ref: 'erniesg/aether#456.diff' }],
        },
      ],
      commits: [{ sha: 'abc123', message: 'Add motion workflow signal' }],
      reviews: [{ reviewer: 'claude', state: 'approved' }],
      ci: [{ name: 'test', status: 'passed' }],
      provenance: [{ kind: 'code-change', ref: 'erniesg/aether#456' }],
    },
    platformTargets: [{ platform: 'x', aspectRatio: '16:9', seconds: 60 }],
    createdAt: 20,
  });
}

describe('buildMotionVisualSourcingPlan', () => {
  it('creates reviewable reference, key-still, and asset-selection requests for repo launch videos', () => {
    const plan = buildMotionVisualSourcingPlan(repoProject(), { requestedAt: 30 });

    expect(plan).toMatchObject({
      id: 'visual-sourcing-plan-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'ready',
      providerRequirements: ['asset-library', 'reference-search', 'image-generation'],
      blockers: [],
      nextActions: [
        { id: 'find-references', label: 'Find references' },
        { id: 'generate-key-stills', label: 'Generate key stills' },
        { id: 'select-source-assets', label: 'Select source assets' },
        { id: 'review-visual-sources', label: 'Review visual sources' },
      ],
    });
    expect(plan.requests.map((request) => request.kind)).toEqual([
      'asset-selection',
      'reference-search',
      'image-generation',
    ]);
    expect(plan.requests[0]).toMatchObject({
      id: 'visual-source-capture-assets',
      toolIds: ['motion-capture', 'motion-visuals'],
      apiRoutes: ['/api/motion/capture', '/api/motion/visuals'],
      targetRoles: ['demo', 'proof', 'payoff'],
    });
    expect(plan.requests[1].prompt).toContain('Find visual and motion references');
    expect(plan.requests[2].prompt).toContain('Do not hallucinate product UI');
    expect(plan.visualSourcingNode).toMatchObject({
      id: 'node-visual-sourcing-plan',
      kind: 'visual-search',
      status: 'planned',
      outputRefs: [
        'visual-source-capture-assets',
        'visual-source-reference-search',
        'visual-source-key-stills',
      ],
    });
  });

  it('keeps PR-to-video on diff and evidence visuals instead of product scrape requests', () => {
    const plan = buildMotionVisualSourcingPlan(prProject(), { requestedAt: 31 });

    expect(plan).toMatchObject({
      projectId: 'motion-aether-pr',
      status: 'ready',
      providerRequirements: ['code-change-ingest'],
    });
    expect(plan.requests).toEqual([
      expect.objectContaining({
        id: 'visual-source-code-proof',
        kind: 'code-proof',
        label: 'Select code proof visuals',
        targetRoles: ['change', 'diff', 'mechanism', 'evidence'],
        apiRoutes: ['/api/motion/visuals'],
      }),
    ]);
    expect(plan.requests[0].prompt).toContain('Do not scrape the product site');
    expect(plan.requests[0].prompt).toContain('derive the visuals from the PR facts');
  });
});
