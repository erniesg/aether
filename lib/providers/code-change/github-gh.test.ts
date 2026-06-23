import { describe, expect, it } from 'vitest';
import { createGitHubGhCodeChangeProvider, type GhCommandRunner } from './github-gh';

function createRunner(outputs: Record<string, string>): {
  run: GhCommandRunner;
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      const key = args.join(' ');
      const output = outputs[key];
      if (output === undefined) {
        throw new Error(`unexpected gh command: ${key}`);
      }
      return output;
    },
  };
}

describe('createGitHubGhCodeChangeProvider', () => {
  it('ingests a GitHub PR with metadata, paginated files, CI, reviews, and diff hunks', async () => {
    const prJson = JSON.stringify({
      number: 123,
      title: 'Add repo video drafts',
      url: 'https://github.com/erniesg/aether/pull/123',
      author: { login: 'erniesg', name: 'Ernie', avatarUrl: 'https://avatars.example/ernie.png' },
      commits: [
        {
          oid: 'abc123',
          messageHeadline: 'Add PR storyboard builder',
          authors: [{ name: 'Ernie' }],
        },
      ],
      latestReviews: [{ author: { login: 'reviewer' }, state: 'APPROVED' }],
      statusCheckRollup: [
        { name: 'typecheck', conclusion: 'SUCCESS', detailsUrl: 'https://ci.example/typecheck' },
        { context: 'lint', state: 'PENDING', targetUrl: 'https://ci.example/lint' },
      ],
    });
    const filesJson = JSON.stringify([
      [
        {
          filename: 'lib/motion/storyboard.ts',
          status: 'modified',
          additions: 42,
          deletions: 4,
          language: 'TypeScript',
        },
      ],
    ]);
    const diffPatch = [
      'diff --git a/lib/motion/storyboard.ts b/lib/motion/storyboard.ts',
      'index 1111111..2222222 100644',
      '--- a/lib/motion/storyboard.ts',
      '+++ b/lib/motion/storyboard.ts',
      '@@ -80,2 +92,4 @@ export function buildRepoLaunchMotionProject() {',
      '+export function buildCodeChangeMotionProject(input) {',
      '+  return createPrExplainer(input);',
    ].join('\n');
    const { calls, run } = createRunner({
      'pr view 123 --repo erniesg/aether --json number,title,url,author,commits,latestReviews,statusCheckRollup':
        prJson,
      'api repos/erniesg/aether/pulls/123/files --paginate --slurp': filesJson,
      'pr diff 123 --repo erniesg/aether --patch --color never': diffPatch,
    });
    const provider = createGitHubGhCodeChangeProvider({
      run,
      isAvailable: () => true,
    });

    const result = await provider.ingest({
      source: { kind: 'github-pr', ref: 'erniesg/aether#123' },
    });

    expect(provider.available()).toBe(true);
    expect(calls).toEqual([
      [
        'pr',
        'view',
        '123',
        '--repo',
        'erniesg/aether',
        '--json',
        'number,title,url,author,commits,latestReviews,statusCheckRollup',
      ],
      ['api', 'repos/erniesg/aether/pulls/123/files', '--paginate', '--slurp'],
      ['pr', 'diff', '123', '--repo', 'erniesg/aether', '--patch', '--color', 'never'],
    ]);
    expect(result).toMatchObject({
      providerId: 'github-gh',
      title: 'Add repo video drafts',
      author: { name: 'Ernie', avatarUrl: 'https://avatars.example/ernie.png' },
      files: [
        {
          path: 'lib/motion/storyboard.ts',
          status: 'modified',
          additions: 42,
          deletions: 4,
          language: 'TypeScript',
        },
      ],
      commits: [{ sha: 'abc123', message: 'Add PR storyboard builder', authorName: 'Ernie' }],
      reviews: [{ reviewer: 'reviewer', state: 'approved' }],
      ci: [
        { name: 'typecheck', status: 'passed', url: 'https://ci.example/typecheck' },
        { name: 'lint', status: 'pending', url: 'https://ci.example/lint' },
      ],
      provenance: [
        { kind: 'code-change', ref: 'github:erniesg/aether#123' },
      ],
    });
    expect(result.hunks).toEqual([
      {
        id: 'hunk-lib-motion-storyboard-ts-92',
        filePath: 'lib/motion/storyboard.ts',
        oldStart: 80,
        newStart: 92,
        lines: [
          '+export function buildCodeChangeMotionProject(input) {',
          '+  return createPrExplainer(input);',
        ],
        provenance: [{ kind: 'code-change', ref: 'diff:lib/motion/storyboard.ts#92' }],
      },
    ]);
  });

  it('parses GitHub pull request URLs as source refs', async () => {
    const { run } = createRunner({
      'pr view 456 --repo erniesg/aether --json number,title,url,author,commits,latestReviews,statusCheckRollup':
        JSON.stringify({ title: 'Fix launch reel', author: { login: 'erniesg' } }),
      'api repos/erniesg/aether/pulls/456/files --paginate --slurp': JSON.stringify([]),
      'pr diff 456 --repo erniesg/aether --patch --color never': '',
    });
    const provider = createGitHubGhCodeChangeProvider({ run, isAvailable: () => true });

    const result = await provider.ingest({
      source: { kind: 'github-pr', ref: 'https://github.com/erniesg/aether/pull/456' },
    });

    expect(result.provenance[0]).toEqual({ kind: 'code-change', ref: 'github:erniesg/aether#456' });
  });

  it('rejects non-GitHub PR sources', async () => {
    const provider = createGitHubGhCodeChangeProvider({
      run: async () => '',
      isAvailable: () => true,
    });

    await expect(
      provider.ingest({ source: { kind: 'local-diff', ref: 'HEAD~1..HEAD' } })
    ).rejects.toThrow(/github-pr/);
  });

  it('reports unavailable when the gh runner is unavailable', () => {
    const provider = createGitHubGhCodeChangeProvider({
      run: async () => '',
      isAvailable: () => false,
    });

    expect(provider.available()).toBe(false);
  });
});
