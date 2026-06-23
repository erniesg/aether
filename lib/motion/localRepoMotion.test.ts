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
        summary: 'local repo with 2 app routes and 3 capture candidates',
      },
    });
    expect(project.sourceProfile?.captureCandidates[0]).toMatchObject({
      id: 'capture-local-app-still',
      label: 'Capture local app route /',
      targetKind: 'local-app',
      targetRef: 'http://localhost:3000/',
      setup: 'npm run dev',
    });
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
});
