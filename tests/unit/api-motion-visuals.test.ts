import { describe, expect, it } from 'vitest';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import type { MotionProject } from '@/lib/motion/project';

function repoProject(): MotionProject {
  return buildRepoLaunchMotionProject({
    id: 'motion-aether-launch',
    workspaceId: 'demo-ws',
    projectKind: 'launch',
    workflowMode: 'review',
    audience: 'builders',
    tone: 'precise',
    appProfile: {
      name: 'aether',
      repoUrl: 'https://github.com/erniesg/aether',
      siteUrl: 'https://aether.example',
      summary: 'Canvas-native creative system.',
      stack: ['Next.js', 'Convex', 'tldraw'],
    },
    claims: [
      {
        text: 'Uses Next.js, Convex, and tldraw.',
        source: { kind: 'repo', ref: 'package.json#dependencies' },
      },
    ],
    sourceProfile: {
      kind: 'github-repo',
      label: 'aether source material',
      sourceRef: 'https://github.com/erniesg/aether',
      summary: 'GitHub repo with hosted capture candidates',
      signals: [],
      captureCandidates: [
        {
          id: 'capture-hosted-still',
          label: 'Capture aether homepage',
          mode: 'screenshot',
          targetKind: 'url',
          targetRef: 'https://aether.example',
          reason: 'Hosted site is available as product evidence.',
          provenance: [{ kind: 'site', ref: 'https://aether.example' }],
        },
      ],
      storyboardHints: [],
      provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
    },
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    createdAt: 10,
  });
}

function prProject(): MotionProject {
  return buildCodeChangeMotionProject({
    id: 'motion-aether-pr',
    workspaceId: 'demo-ws',
    sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#456' },
    workflowMode: 'review',
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

describe('POST /api/motion/visuals', () => {
  it('returns provider-neutral visual sourcing requests for launch videos', async () => {
    const { POST } = await import('@/app/api/motion/visuals/route');
    const res = await POST(
      new Request('http://localhost/api/motion/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: repoProject(),
          kinds: ['reference-search', 'image-generation'],
          requestedAt: 900,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      project: { id: 'motion-aether-launch' },
      visualSourcingPlan: {
        status: 'ready',
        providerRequirements: ['asset-library', 'reference-search', 'image-generation'],
      },
      selectedRequests: [
        expect.objectContaining({
          id: 'visual-source-reference-search',
          apiRoutes: ['/api/research', '/api/reference-ingest'],
        }),
        expect.objectContaining({
          id: 'visual-source-key-stills',
          apiRoutes: ['/api/generate', '/api/motion/visuals'],
        }),
      ],
      previewPlan: {
        visualSourcingSummary: {
          requestCount: 3,
          requestLabels: [
            'Select product source assets',
            'Find motion references',
            'Generate key stills',
          ],
        },
      },
    });
    expect(json.providers.reference.map((provider: { id: string }) => provider.id)).toContain(
      'generic'
    );
  });

  it('returns PR code-proof sourcing without product capture or reference search requests', async () => {
    const { POST } = await import('@/app/api/motion/visuals/route');
    const res = await POST(
      new Request('http://localhost/api/motion/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: prProject(),
          requestedAt: 901,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      visualSourcingPlan: {
        providerRequirements: ['code-change-ingest'],
        requests: [
          {
            id: 'visual-source-code-proof',
            kind: 'code-proof',
            apiRoutes: ['/api/motion/visuals'],
          },
        ],
      },
      selectedRequests: [
        {
          id: 'visual-source-code-proof',
          kind: 'code-proof',
        },
      ],
    });
    expect(json.selectedRequests[0].prompt).toContain('Do not scrape the product site');
  });

  it('rejects unknown visual request selections', async () => {
    const { POST } = await import('@/app/api/motion/visuals/route');
    const res = await POST(
      new Request('http://localhost/api/motion/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: repoProject(),
          requestIds: ['not-in-plan'],
        }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'requestIds or kinds must reference visual sourcing requests in the plan',
    });
  });
});
