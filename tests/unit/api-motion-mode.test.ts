import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function makeLocalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-api-motion-mode-'));
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

async function startReviewProject() {
  const repoPath = await makeLocalRepo();
  const { POST } = await import('@/app/api/motion/start/route');
  const res = await POST(
    new Request('http://localhost/api/motion/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'motion-tong-mode',
        workspaceId: 'demo-ws',
        repoPath,
        intent: 'launch',
        mode: 'review',
        audience: 'language learners',
        tone: 'textural',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: ['remotion', 'hyperframes'],
        createdAt: 900,
      }),
    })
  );

  expect(res.status).toBe(200);
  return await res.json();
}

describe('POST /api/motion/mode', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('switches workflow mode on the same editable project without losing selected state', async () => {
    const started = await startReviewProject();
    const selectedProject = {
      ...started.project,
      currentDraftId: 'draft-demo-first',
      executionHistory: [
        {
          id: 'history-setup-local-app-901',
          gateId: 'setup',
          label: 'Local app dry run',
          providerId: 'playwright-local',
          savedAt: 901,
          receiptCount: 1,
          receiptLabels: ['local app ready'],
          receipts: [
            {
              id: 'receipt-local-app-ready',
              kind: 'setup',
              label: 'local app ready',
              ref: 'setup://local-app',
              providerId: 'playwright-local',
            },
          ],
          provenance: [{ kind: 'provider', ref: 'playwright-local' }],
        },
      ],
    };
    const sourceRefs = selectedProject.sourceRefs;
    const { POST } = await import('@/app/api/motion/mode/route');

    const fullAutoRes = await POST(
      new Request('http://localhost/api/motion/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject,
          mode: 'full-auto',
          requestedEngines: ['remotion', 'hyperframes'],
          requestedAt: 910,
        }),
      })
    );

    expect(fullAutoRes.status).toBe(200);
    const fullAutoJson = await fullAutoRes.json();
    expect(fullAutoJson).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'repo-launch-video',
        plan: {
          mode: 'full-auto',
          primaryAction: 'run-full-auto',
          runPlan: {
            mode: 'full-auto',
            primaryAction: 'run-full-auto',
          },
        },
      },
      project: {
        id: 'motion-tong-mode',
        workflowMode: 'full-auto',
        currentDraftId: 'draft-demo-first',
        sourceRefs,
        executionHistory: selectedProject.executionHistory,
      },
      reviewPlan: {
        workflowMode: 'full-auto',
        primaryAction: 'queue-render',
      },
      previewPlan: {
        workflowMode: 'full-auto',
        modeControl: {
          currentMode: 'full-auto',
          options: expect.arrayContaining([
            expect.objectContaining({
              mode: 'review',
              status: 'available',
              route: '/api/motion/mode',
              requestTemplate: expect.objectContaining({
                project: '$motionProject',
                mode: 'review',
              }),
            }),
            expect.objectContaining({
              mode: 'full-auto',
              status: 'active',
              route: '/api/motion/mode',
              requestTemplate: expect.objectContaining({
                project: '$motionProject',
                mode: 'full-auto',
              }),
            }),
          ]),
          currentLabel: 'full auto',
        },
        executionHistory: {
          savedStepCount: 1,
          latestReceiptLabels: ['local app ready'],
        },
      },
      agentHandoff: {
        projectId: 'motion-tong-mode',
        mode: 'full-auto',
        nextTemplateId: 'full-auto-run',
      },
    });

    const reviewRes = await POST(
      new Request('http://localhost/api/motion/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: fullAutoJson.project,
          mode: 'review',
          requestedEngines: ['remotion', 'hyperframes'],
          requestedAt: 920,
        }),
      })
    );

    expect(reviewRes.status).toBe(200);
    const reviewJson = await reviewRes.json();
    expect(reviewJson).toMatchObject({
      ok: true,
      project: {
        id: 'motion-tong-mode',
        workflowMode: 'review',
        currentDraftId: 'draft-demo-first',
        sourceRefs,
        executionHistory: selectedProject.executionHistory,
      },
      reviewPlan: {
        workflowMode: 'review',
        primaryAction: 'request-review',
      },
      previewPlan: {
        workflowMode: 'review',
        modeControl: {
          currentMode: 'review',
          currentLabel: 'review gates',
        },
      },
      agentHandoff: {
        mode: 'review',
        nextTemplateId: 'review-capture',
      },
    });
  });

  it('rejects malformed mode switch requests', async () => {
    const { POST } = await import('@/app/api/motion/mode/route');

    const missingProjectRes = await POST(
      new Request('http://localhost/api/motion/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full-auto' }),
      })
    );

    expect(missingProjectRes.status).toBe(400);
    await expect(missingProjectRes.json()).resolves.toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const invalidModeRes = await POST(
      new Request('http://localhost/api/motion/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: { id: 'motion-test' }, mode: 'auto' }),
      })
    );

    expect(invalidModeRes.status).toBe(400);
    await expect(invalidModeRes.json()).resolves.toMatchObject({
      ok: false,
      error: 'mode must be review or full-auto',
    });
  });
});
