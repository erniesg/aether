import { describe, expect, it, vi } from 'vitest';
import {
  RepoFactsError,
  extractProjectFactsFromGitHubFixture,
  fetchRepoFacts,
  parseGitHubRepoUrl,
} from './repo-facts';

const GITHUB_FIXTURE = {
  repo: {
    name: 'aether',
    full_name: 'erniesg/aether',
    description: 'Canvas-native creative system built with Next.js and Convex.',
    html_url: 'https://github.com/erniesg/aether',
    stargazers_count: 42,
    forks_count: 7,
    open_issues_count: 3,
    pushed_at: '2026-06-09T10:22:00Z',
    topics: ['nextjs', 'convex', 'tldraw', 'cloudflare-workers'],
  },
  languages: {
    TypeScript: 154204,
    CSS: 9120,
    JavaScript: 3377,
  },
  releases: [
    {
      tag_name: 'v0.5.0',
      name: 'Social canvas buildout',
      published_at: '2026-06-08T12:00:00Z',
      html_url: 'https://github.com/erniesg/aether/releases/tag/v0.5.0',
    },
  ],
  readme: [
    '# aether',
    'A Next.js 15, Cloudflare Workers, Convex, and tldraw creative canvas.',
    'Includes provider adapters for OpenAI, Gemini, Replicate, and Volcengine.',
  ].join('\n'),
};

function hasNumberOrNamedTech(text: string): boolean {
  return (
    /\d/.test(text) ||
    /\b(Next\.js|Nextjs|Convex|TypeScript|Cloudflare Workers|tldraw|OpenAI|Gemini|Replicate|Volcengine)\b/i.test(
      text
    )
  );
}

describe('repo facts · GitHub extractor', () => {
  it('extracts at least three numeric or technology-bearing claims from recorded GitHub payloads', () => {
    const facts = extractProjectFactsFromGitHubFixture(GITHUB_FIXTURE, {
      repoUrl: 'https://github.com/erniesg/aether',
    });

    expect(facts.name).toBe('aether');
    expect(facts.description).toMatch(/canvas-native/i);
    expect(facts.languages).toEqual(['TypeScript', 'CSS', 'JavaScript']);
    expect(facts.releases[0]).toMatchObject({ tag: 'v0.5.0' });
    expect(facts.readmeHighlights).toContain('Next.js 15');
    expect(facts.claims.length).toBeGreaterThanOrEqual(3);
    for (const claim of facts.claims.slice(0, 3)) {
      expect(claim.source).toEqual({
        kind: 'repo',
        ref: 'https://github.com/erniesg/aether',
      });
      expect(hasNumberOrNamedTech(claim.text)).toBe(true);
    }
  });

  it('parses GitHub repo URLs without keeping branch, issue, or query suffixes', () => {
    expect(
      parseGitHubRepoUrl('https://github.com/erniesg/aether/tree/main?tab=readme')
    ).toEqual({ owner: 'erniesg', repo: 'aether' });
  });

  it('throws a typed error for malformed repo URLs', async () => {
    await expect(fetchRepoFacts('https://example.com/not-a-repo')).rejects.toMatchObject({
      name: 'RepoFactsError',
      code: 'invalid_repo_url',
    });
  });

  it('throws a typed not-found error for missing GitHub repos instead of crashing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const err = await fetchRepoFacts('https://github.com/erniesg/missing', {
      fetcher,
    }).catch((error) => error);

    expect(err).toBeInstanceOf(RepoFactsError);
    expect(err.code).toBe('github_not_found');
  });
});
