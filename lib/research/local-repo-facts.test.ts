import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchLocalRepoFacts, normalizeLocalRepoPath } from './local-repo-facts';

const tempDirs: string[] = [];

async function makeRepo(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `aether-${name}-`));
  tempDirs.push(dir);
  return dir;
}

describe('local repo facts', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('extracts grounded project facts from a local repo folder', async () => {
    const repoPath = await makeRepo('tong');
    await mkdir(join(repoPath, 'src', 'app'), { recursive: true });
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify(
        {
          name: 'tong',
          description: 'City-specific language learning app.',
          dependencies: {
            '@convex-dev/react-query': '^0.1.0',
            '@tldraw/tldraw': '^3.0.0',
            next: '^15.0.0',
            react: '^19.0.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^4.0.0',
          },
          scripts: {
            dev: 'next dev',
            test: 'vitest run',
          },
        },
        null,
        2
      )
    );
    await writeFile(
      join(repoPath, 'README.md'),
      [
        '# Tong',
        'Tong is a Tokyo language-learning app built with Next.js, React, TypeScript, Convex, and tldraw.',
        'The app turns city moments into exportable practice cards.',
      ].join('\n')
    );
    await writeFile(join(repoPath, 'src', 'app', 'page.tsx'), 'export default function Page() {}');
    await writeFile(join(repoPath, 'src', 'app', 'style.css'), '.app { color: red; }');

    const facts = await fetchLocalRepoFacts(repoPath);

    expect(normalizeLocalRepoPath(repoPath)).toBe(repoPath);
    expect(facts).toMatchObject({
      name: 'tong',
      description: 'City-specific language learning app.',
      languages: ['TypeScript', 'CSS'],
      readmeHighlights: ['Next.js 15', 'React', 'TypeScript', 'Convex', 'tldraw', 'Vitest'],
      enrichment: 'none',
    });
    expect(facts.claims).toEqual(
      expect.arrayContaining([
        {
          text: 'tong local repo uses TypeScript, CSS across 2 source files.',
          source: { kind: 'repo', ref: repoPath },
        },
        {
          text: 'tong package depends on @convex-dev/react-query, @tldraw/tldraw, next, react, typescript.',
          source: { kind: 'repo', ref: join(repoPath, 'package.json') },
        },
        {
          text: 'tong package defines dev, test scripts.',
          source: { kind: 'repo', ref: join(repoPath, 'package.json') },
        },
      ])
    );
  });
});
