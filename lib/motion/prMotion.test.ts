import { describe, expect, it, vi } from 'vitest';
import type { CodeChangeProvider } from '@/lib/providers/code-change/types';
import { buildPrMotionProjectFromSource } from './prMotion';

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

describe('buildPrMotionProjectFromSource', () => {
  it('collects PR evidence and repo facts into an editable code-change motion project', async () => {
    const ingest = vi.fn<CodeChangeProvider['ingest']>(async (request) => ({
      providerId: 'test-code-change',
      title: 'Add timeline revision tools',
      author: { name: 'Ernie' },
      files: [
        {
          path: 'lib/motion/revise.ts',
          status: 'added',
          additions: 120,
          deletions: 0,
          language: 'TypeScript',
        },
      ],
      hunks: [
        {
          id: 'hunk-lib-motion-revise-ts-1',
          filePath: 'lib/motion/revise.ts',
          newStart: 1,
          lines: [
            '+export function applyMotionTimelineRevision(project, input) {',
            '+  return reviseProject(project, input);',
          ],
          provenance: [{ kind: 'code-change', ref: 'diff:lib/motion/revise.ts#1' }],
        },
      ],
      commits: [{ sha: 'abc123', message: 'Add timeline revisions' }],
      reviews: [{ reviewer: 'designer', state: 'approved' }],
      ci: [{ name: 'typecheck', status: 'passed' }],
      provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#123' }],
    }));
    const provider: CodeChangeProvider = {
      id: 'test-code-change',
      displayName: 'Test code change',
      available: () => true,
      ingest,
    };
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const href = String(url);
      if (href === 'https://api.github.com/repos/erniesg/aether') {
        return githubJson({
          name: 'aether',
          description: 'Creator-first canvas tool.',
          stargazers_count: 42,
          forks_count: 7,
          open_issues_count: 3,
          pushed_at: '2026-06-22T10:22:00Z',
          topics: ['canvas', 'video'],
        });
      }
      if (href.endsWith('/languages')) {
        return githubJson({ TypeScript: 1000, CSS: 200 });
      }
      if (href.endsWith('/releases?per_page=5')) return githubJson([]);
      if (href.endsWith('/readme')) {
        return githubText('A Next.js, Convex, and tldraw creator canvas.');
      }
      return new Response('not found', { status: 404 });
    });

    const project = await buildPrMotionProjectFromSource(
      {
        id: 'motion-aether-pr-123',
        workspaceId: 'demo-ws',
        prRef: 'https://github.com/erniesg/aether/pull/123',
        workflowMode: 'review',
        audience: 'maintainers',
        tone: 'crisp',
        platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
        materializeTimeline: true,
        createdAt: 400,
      },
      { codeChangeProvider: provider, fetcher }
    );

    expect(ingest).toHaveBeenCalledWith({
      source: { kind: 'github-pr', ref: 'https://github.com/erniesg/aether/pull/123' },
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/erniesg/aether',
      expect.any(Object)
    );
    expect(project).toMatchObject({
      id: 'motion-aether-pr-123',
      title: 'aether PR video',
      workflowMode: 'review',
      brief: {
        projectKind: 'pr',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Creator-first canvas tool.',
          stack: ['TypeScript', 'CSS'],
        },
      },
    });
    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'change',
      'diff',
      'mechanism',
      'evidence',
      'cta',
    ]);
    expect(project.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(project.graphNodes.map((node) => node.kind)).toEqual([
      'pr-ingest',
      'script',
      'storyboard',
      'sync',
    ]);
    expect(project.graphNodes[0]).toMatchObject({
      providerId: 'test-code-change',
      inputRefs: ['https://github.com/erniesg/aether/pull/123'],
      outputRefs: ['github:erniesg/aether#123'],
    });
  });

  it('supports owner/repo#number shorthand PR refs', async () => {
    const provider: CodeChangeProvider = {
      id: 'test-code-change',
      displayName: 'Test code change',
      available: () => true,
      ingest: async () => ({
        providerId: 'test-code-change',
        title: 'Fix launch video',
        files: [],
        hunks: [],
        commits: [],
        reviews: [],
        ci: [],
        provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#456' }],
      }),
    };

    const project = await buildPrMotionProjectFromSource(
      {
        id: 'motion-aether-pr-456',
        workspaceId: 'demo-ws',
        prRef: 'erniesg/aether#456',
        workflowMode: 'full-auto',
        audience: 'maintainers',
        tone: 'crisp',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Creator-first canvas tool.',
          stack: ['TypeScript'],
        },
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 401,
      },
      { codeChangeProvider: provider }
    );

    expect(project.brief.appProfile.repoUrl).toBe('https://github.com/erniesg/aether');
    expect(project.workflowMode).toBe('full-auto');
    expect(project.tracks).toEqual([]);
  });
});
