import { describe, expect, it, vi } from 'vitest';
import { buildRepoMotionProjectFromUrl } from './repoMotion';

function githubJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function githubText(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('buildRepoMotionProjectFromUrl', () => {
  it('turns a GitHub repo URL into a grounded launch motion project', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const href = String(url);
      if (href === 'https://api.github.com/repos/erniesg/aether') {
        return githubJson({
          name: 'aether',
          description: 'Canvas-native creative system.',
          homepage: 'https://aether.example/',
          stargazers_count: 42,
          forks_count: 7,
          open_issues_count: 3,
          pushed_at: '2026-06-09T10:22:00Z',
          topics: ['nextjs', 'convex', 'tldraw'],
        });
      }
      if (href.endsWith('/languages')) {
        return githubJson({ TypeScript: 1000, CSS: 200, JavaScript: 50 });
      }
      if (href.endsWith('/releases?per_page=5')) {
        return githubJson([
          {
            tag_name: 'v0.5.0',
            published_at: '2026-06-08T12:00:00Z',
            html_url: 'https://github.com/erniesg/aether/releases/tag/v0.5.0',
          },
        ]);
      }
      if (href.endsWith('/readme')) {
        return githubText('A Next.js 15, Convex, and tldraw creative canvas.');
      }
      return new Response('not found', { status: 404 });
    });

    const project = await buildRepoMotionProjectFromUrl(
      {
        id: 'motion-aether-launch',
        workspaceId: 'demo-ws',
        repoUrl: 'https://github.com/erniesg/aether/tree/main?tab=readme',
        projectKind: 'launch',
        audience: 'creative app builders',
        tone: 'precise',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 60,
      },
      { fetcher }
    );

    expect(project.brief.appProfile).toMatchObject({
      name: 'aether',
      repoUrl: 'https://github.com/erniesg/aether',
      siteUrl: 'https://aether.example',
      summary: 'Canvas-native creative system.',
      stack: ['TypeScript', 'CSS', 'JavaScript'],
    });
    expect(project.sourceRefs).toContainEqual({
      kind: 'site',
      ref: 'https://aether.example',
    });
    expect(project.sourceProfile).toMatchObject({
      kind: 'github-repo',
      label: 'aether source material',
      summary: 'GitHub repo with 2 capture candidates',
      captureCandidates: [
        expect.objectContaining({
          id: 'capture-hosted-still',
          targetKind: 'url',
          targetRef: 'https://aether.example',
        }),
        expect.objectContaining({
          id: 'record-hosted-flow',
          mode: 'screen-recording',
          targetRef: 'https://aether.example',
        }),
      ],
    });
    expect(project.brief.claims[0]).toEqual({
      text: 'aether has 42 GitHub stars and 7 forks.',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
    });
    expect(project.graphNodes[0]).toMatchObject({
      kind: 'repo-ingest',
      inputRefs: ['https://github.com/erniesg/aether'],
    });
    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
  });

  it('can materialize an editable timeline from repo facts in the same workflow', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const href = String(url);
      if (href === 'https://api.github.com/repos/erniesg/tong') {
        return githubJson({
          name: 'tong',
          description: 'City-specific language learning app.',
          stargazers_count: 0,
          forks_count: 0,
          topics: ['language-learning'],
        });
      }
      if (href.endsWith('/languages')) return githubJson({ TypeScript: 1000 });
      if (href.endsWith('/releases?per_page=5')) return githubJson([]);
      if (href.endsWith('/readme')) return githubText('Built with React and TypeScript.');
      return new Response('not found', { status: 404 });
    });

    const project = await buildRepoMotionProjectFromUrl(
      {
        id: 'motion-tong-feature',
        workspaceId: 'demo-ws',
        repoUrl: 'https://github.com/erniesg/tong',
        projectKind: 'feature',
        audience: 'language learners',
        tone: 'textural',
        platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
        materializeTimeline: true,
        createdAt: 70,
      },
      { fetcher }
    );

    expect(project.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(project.drafts[0].status).toBe('ready');
    expect(project.graphNodes.map((node) => node.kind)).toContain('sync');
  });
});
