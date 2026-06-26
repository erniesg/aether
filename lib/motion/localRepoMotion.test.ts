import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildLocalRepoMotionProjectFromPath } from './localRepoMotion';

const tempDirs: string[] = [];

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-local-motion-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'src', 'app', 'gallery'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'paillette',
      description: 'Open-access art search with provenance.',
      dependencies: {
        '@tldraw/tldraw': '^3.0.0',
        next: '^15.0.0',
        react: '^19.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        dev: 'next dev',
      },
    })
  );
  await writeFile(
    join(dir, 'README.md'),
    'Paillette is a Next.js and tldraw art-search canvas with TypeScript provenance receipts.'
  );
  await writeFile(join(dir, 'src', 'index.tsx'), 'export const app = true;');
  await writeFile(join(dir, 'src', 'app', 'page.tsx'), 'export default function Page() {}');
  await writeFile(
    join(dir, 'src', 'app', 'gallery', 'page.tsx'),
    'export default function GalleryPage() {}'
  );
  return dir;
}

async function makePnpmViteRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-local-motion-vite-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'tong-vite',
      description: 'Route-first language practice app.',
      dependencies: {
        '@vitejs/plugin-react': '^5.0.0',
        vite: '^7.0.0',
        react: '^19.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        dev: 'vite --host 0.0.0.0 --port 4310',
      },
    })
  );
  await writeFile(
    join(dir, 'README.md'),
    'Tong Vite is a React and TypeScript route-first language practice app.'
  );
  await writeFile(join(dir, 'src', 'main.tsx'), 'export const app = true;');
  return dir;
}

async function makeCloudflareLocalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-local-motion-cloudflare-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'app', 'search'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'paillette-cf',
      description: 'Cloudflare-backed art search app.',
      dependencies: {
        '@cloudflare/workers-types': '^4.0.0',
        react: '^19.0.0',
        wrangler: '^4.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        build: 'tsc',
        'dev:local': 'wrangler pages dev --port 8789',
      },
    })
  );
  await writeFile(
    join(dir, 'README.md'),
    'Paillette CF is a Cloudflare Workers and TypeScript art search app.'
  );
  await writeFile(join(dir, 'app', 'page.tsx'), 'export default function Page() {}');
  await writeFile(
    join(dir, 'app', 'search', 'page.tsx'),
    'export default function SearchPage() {}'
  );
  return dir;
}

describe('buildLocalRepoMotionProjectFromPath', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('turns a local repo path into the same editable repo motion project shape', async () => {
    const repoPath = await makeRepo();

    const project = await buildLocalRepoMotionProjectFromPath({
      id: 'motion-paillette-launch',
      workspaceId: 'demo-ws',
      repoPath,
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'curators',
      tone: 'careful',
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      materializeTimeline: true,
      createdAt: 500,
    });

    expect(project).toMatchObject({
      id: 'motion-paillette-launch',
      title: 'paillette launch video',
      workflowMode: 'review',
      brief: {
        appProfile: {
          name: 'paillette',
          repoUrl: repoPath,
          summary: 'Open-access art search with provenance.',
          stack: ['TypeScript'],
        },
      },
      sourceProfile: {
        kind: 'local-repo',
        label: 'paillette source material',
        summary: 'local repo with 2 app routes and 5 capture candidates',
      },
    });
    expect(project.sourceProfile?.captureCandidates[0]).toMatchObject({
      id: 'capture-local-app-still',
      label: 'Capture local app route /',
      targetKind: 'local-app',
      targetRef: 'http://localhost:3000/',
      setup: 'npm run dev',
    });
    expect(project.sourceProfile?.captureCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-local-app-still-gallery',
          label: 'Capture local app route /gallery',
          targetKind: 'local-app',
          targetRef: 'http://localhost:3000/gallery',
          setup: 'npm run dev',
        }),
        expect.objectContaining({
          id: 'capture-local-dom-gallery',
          label: 'Read local app structure /gallery',
          targetRef: 'http://localhost:3000/gallery',
        }),
      ])
    );
    expect(project.sourceProfile?.storyboardHints.map((hint) => hint.beatRole)).toEqual([
      'hook',
      'proof',
      'demo',
    ]);
    expect(project.brief.claims[0]).toEqual({
      text: 'paillette local repo uses TypeScript across 3 source files.',
      source: { kind: 'repo', ref: repoPath },
    });
    expect(project.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(project.graphNodes.map((node) => node.kind)).toEqual([
      'repo-ingest',
      'script',
      'storyboard',
      'sync',
    ]);
    expect(project.graphNodes[0].inputRefs).toEqual([repoPath]);
  });

  it('carries package-manager launch details into local capture candidates', async () => {
    const repoPath = await makePnpmViteRepo();

    const project = await buildLocalRepoMotionProjectFromPath({
      id: 'motion-tong-vite-launch',
      workspaceId: 'demo-ws',
      repoPath,
      projectKind: 'launch',
      workflowMode: 'full-auto',
      audience: 'language learners',
      tone: 'fast',
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      materializeTimeline: true,
      createdAt: 510,
    });

    expect(project.sourceProfile?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'signal-package-manager', value: 'pnpm' }),
      ])
    );
    expect(project.sourceProfile?.captureCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-local-app-still',
          targetKind: 'local-app',
          targetRef: 'http://localhost:4310/',
          setup: 'pnpm dev',
          setupCwd: repoPath,
        }),
        expect.objectContaining({
          id: 'record-local-flow',
          targetRef: 'http://localhost:4310/',
          setup: 'pnpm dev',
        }),
      ])
    );
  });

  it('uses nonstandard local app scripts for capture launch commands', async () => {
    const repoPath = await makeCloudflareLocalRepo();

    const project = await buildLocalRepoMotionProjectFromPath({
      id: 'motion-paillette-cf-launch',
      workspaceId: 'demo-ws',
      repoPath,
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'curators',
      tone: 'proof-led',
      platformTargets: [{ platform: 'linkedin', aspectRatio: '4:5', seconds: 45 }],
      materializeTimeline: true,
      createdAt: 520,
    });

    expect(project.sourceProfile?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'signal-app-launch',
          value: 'npm run dev:local -> http://localhost:8789',
        }),
      ])
    );
    expect(project.sourceProfile?.captureCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-local-app-still',
          targetRef: 'http://localhost:8789/',
          setup: 'npm run dev:local',
          setupCwd: repoPath,
        }),
        expect.objectContaining({
          id: 'capture-local-app-still-search',
          targetRef: 'http://localhost:8789/search',
          setup: 'npm run dev:local',
          setupCwd: repoPath,
        }),
        expect.objectContaining({
          id: 'record-local-flow',
          targetRef: 'http://localhost:8789/',
          setup: 'npm run dev:local',
        }),
      ])
    );
  });
});
