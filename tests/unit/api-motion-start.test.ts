import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function makeLocalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-api-motion-start-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'tong',
      description: 'City-specific language learning app.',
      dependencies: {
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
    'Tong is a Next.js and React city-language app with TypeScript practice flows.'
  );
  await writeFile(join(dir, 'src', 'page.tsx'), 'export default function Page() {}');
  return dir;
}

describe('POST /api/motion/start', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('starts an editable motion project from a local repo path', async () => {
    const repoPath = await makeLocalRepo();
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-tong-launch',
          workspaceId: 'demo-ws',
          repoPath,
          intent: 'launch',
          mode: 'review',
          audience: 'language learners',
          tone: 'textural',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
          createdAt: 700,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'repo-launch-video',
        reason: 'repo source selected a launch workflow',
      },
      project: {
        id: 'motion-tong-launch',
        title: 'tong launch video',
        brief: {
          appProfile: {
            name: 'tong',
            repoUrl: repoPath,
            summary: 'City-specific language learning app.',
          },
        },
      },
      reviewPlan: {
        projectId: 'motion-tong-launch',
        primaryAction: 'request-review',
      },
      examples: [
        expect.objectContaining({
          id: 'repo-app-launch-video',
          label: 'Repo app launch',
          editSurfaces: expect.arrayContaining(['capture', 'image-to-video', 'export']),
        }),
      ],
      previewPlan: {
        projectId: 'motion-tong-launch',
        title: 'tong launch video',
        primaryAction: 'request-review',
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
    });
    expect(json.capturePlan).toMatchObject({
      projectId: 'motion-tong-launch',
      status: 'needs-source',
      providerRequirements: ['browser-capture'],
    });
    expect(json.previewPlan.timelineRows.map((row: { trackKind: string }) => row.trackKind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
  });

  it('accepts sourceRefs directly and returns a reviewable PR evidence request', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-pr-123',
          workspaceId: 'demo-ws',
          sourceRefs: [{ kind: 'pr', ref: 'erniesg/aether#123' }],
          intent: 'pr',
          mode: 'review',
          audience: 'builders',
          tone: 'precise',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          createdAt: 701,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'needs-evidence',
      project: null,
      reviewPlan: null,
      previewPlan: null,
      examples: [
        expect.objectContaining({
          id: 'daily-skill-launch-pr-to-video',
          label: 'Daily skill launch: PR-to-video',
          storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
          reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
        }),
      ],
      requestedInputs: [
        {
          kind: 'code-change',
          label: 'Collect PR evidence',
          toolId: 'motion-brief',
        },
      ],
    });
    expect(json.examples[0].sampleCopyLines).toContain('npx skills add heygen-com/hyperframes');
  });

  it('rejects requests without a source', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          audience: 'builders',
          tone: 'precise',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: 'Add a repoPath, repoUrl, siteUrl, prRef, or sourceRefs entry',
    });
  });

  it('rejects malformed JSON', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
