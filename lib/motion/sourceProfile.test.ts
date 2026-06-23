import { describe, expect, it } from 'vitest';
import { buildRepoMotionSourceProfile } from './sourceProfile';

describe('buildRepoMotionSourceProfile', () => {
  it('turns local app facts into capture candidates and storyboard hints', () => {
    const profile = buildRepoMotionSourceProfile({
      kind: 'local-repo',
      sourceRef: '/Users/erniesg/code/erniesg/tong',
      projectKind: 'launch',
      appProfile: {
        name: 'tong',
        repoUrl: '/Users/erniesg/code/erniesg/tong',
        summary: 'City-specific language learning app.',
        stack: ['TypeScript'],
      },
      facts: {
        name: 'tong',
        description: 'City-specific language learning app.',
        claims: [],
        releases: [],
        languages: ['TypeScript'],
        readmeHighlights: ['Next.js 15', 'React', 'Convex'],
        enrichment: 'none',
        dependencyNames: ['next', 'react', 'typescript'],
        packageScripts: ['dev', 'test'],
        appRoutes: ['/', '/tokyo'],
        sourceFileCount: 12,
      },
      claims: [
        {
          text: 'tong README names Next.js 15, React, Convex.',
          source: { kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' },
        },
      ],
    });

    expect(profile).toMatchObject({
      kind: 'local-repo',
      label: 'tong source material',
      summary: 'local repo with 2 app routes and 3 capture candidates',
      signals: expect.arrayContaining([
        expect.objectContaining({ id: 'signal-stack', value: 'TypeScript, Next.js 15, React, Convex' }),
        expect.objectContaining({ id: 'signal-routes', value: '/, /tokyo' }),
      ]),
      captureCandidates: expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-local-app-still',
          mode: 'screenshot',
          targetKind: 'local-app',
          targetRef: 'http://localhost:3000/',
          setup: 'npm run dev',
          setupCwd: '/Users/erniesg/code/erniesg/tong',
        }),
        expect.objectContaining({
          id: 'record-local-flow',
          mode: 'screen-recording',
          targetRef: 'http://localhost:3000/',
        }),
      ]),
      storyboardHints: expect.arrayContaining([
        expect.objectContaining({ beatRole: 'hook' }),
        expect.objectContaining({ beatRole: 'proof' }),
        expect.objectContaining({ beatRole: 'demo' }),
      ]),
    });
  });

  it('asks for a product visual source when a repo has no runnable app signal', () => {
    const profile = buildRepoMotionSourceProfile({
      kind: 'github-repo',
      sourceRef: 'https://github.com/erniesg/accrue',
      projectKind: 'feature',
      appProfile: {
        name: 'accrue',
        repoUrl: 'https://github.com/erniesg/accrue',
        summary: 'Finance app repository.',
        stack: ['Python'],
      },
      facts: {
        name: 'accrue',
        description: 'Finance app repository.',
        claims: [],
        releases: [],
        languages: ['Python'],
        readmeHighlights: [],
        enrichment: 'none',
      },
      claims: [],
    });

    expect(profile.captureCandidates).toEqual([
      expect.objectContaining({
        id: 'add-product-capture-source',
        targetKind: 'url',
      }),
    ]);
    expect(profile.captureCandidates[0]).not.toHaveProperty('targetRef');
    expect(profile.summary).toBe(
      'GitHub repo facts are ready; add a product visual source for demo scenes'
    );
  });
});
