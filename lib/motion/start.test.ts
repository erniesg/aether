import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodeChangeProvider } from '@/lib/providers/code-change/types';
import { startAgentMotionWorkflow } from './start';

const tempDirs: string[] = [];

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

describe('startAgentMotionWorkflow', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('starts a repo launch as a routed workflow with an editable review plan', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const href = String(url);
      if (href === 'https://api.github.com/repos/erniesg/aether') {
        return githubJson({
          name: 'aether',
          description: 'Canvas-native creative system.',
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
      if (href.endsWith('/releases?per_page=5')) return githubJson([]);
      if (href.endsWith('/readme')) {
        return githubText('A Next.js 15, Convex, and tldraw creative canvas.');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await startAgentMotionWorkflow(
      {
        id: 'motion-aether-launch',
        workspaceId: 'demo-ws',
        intent: 'launch',
        mode: 'review',
        sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
        audience: 'creative app builders',
        tone: 'precise',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: ['hyperframes'],
        createdAt: 300,
      },
      { fetcher }
    );

    expect(result).toMatchObject({
      status: 'ready',
      requestedInputs: [],
      workflow: {
        workflowId: 'repo-launch-video',
        reason: 'repo source selected a launch workflow',
      },
    });
    expect(result.workflow.plan).toMatchObject({
      sourceStatus: 'ready',
      primaryAction: 'request-review',
      engines: ['hyperframes'],
      runPlan: {
        status: 'ready',
        primaryAction: 'request-review',
        nextStepId: 'step-plan',
      },
    });
    expect(result.workflow.plan.runPlan.steps.map((step) => step.apiRoutes[0])).toEqual([
      '/api/motion/start',
      '/api/motion/regenerate',
      '/api/motion/capture',
      '/api/motion/voice',
      '/api/motion/sync',
      '/api/motion/render',
      '/api/motion/export-pack',
    ]);
    expect(result.examples).toEqual([
      expect.objectContaining({
        id: 'repo-app-launch-video',
        label: 'Repo app launch',
        editSurfaces: expect.arrayContaining(['capture', 'image-to-video', 'export']),
      }),
    ]);
    expect(result.project).toMatchObject({
      id: 'motion-aether-launch',
      title: 'aether launch video',
      workflowMode: 'review',
    });
    expect(result.project?.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(result.reviewPlan).toMatchObject({
      projectId: 'motion-aether-launch',
      primaryAction: 'request-review',
      summary: {
        appName: 'aether',
        projectKind: 'launch',
        totalSeconds: 30,
      },
    });
    expect(result.reviewPlan?.drafts.map((draft) => draft.label)).toEqual([
      'Primary launch cut',
      'Proof-first cut',
      'Demo-first cut',
    ]);
    expect(
      result.reviewPlan?.componentSlots.some((slot) => slot.componentId === 'app-frame')
    ).toBe(true);
    expect(
      result.reviewPlan?.componentSlots.some((slot) => slot.componentId === 'voice-line')
    ).toBe(true);
  });

  it('starts a website/app URL as an editable capture-first video plan', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === 'https://tong.app/tokyo') {
        return new Response(
          `
          <html>
            <head><title>Tong Tokyo</title></head>
            <body>
              <h1>Tong Tokyo</h1>
              <p>Tong is a city-specific language learning app built with React and TypeScript.</p>
              <p>Practice Tokyo ticket-machine phrases with photo-memory prompts and exportable study cards.</p>
            </body>
          </html>
          `,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }
        );
      }

      return new Response('not found', { status: 404 });
    });

    const result = await startAgentMotionWorkflow(
      {
        id: 'motion-tong-demo',
        workspaceId: 'demo-ws',
        intent: 'demo',
        mode: 'review',
        sourceRefs: [{ kind: 'site', ref: 'https://tong.app/tokyo', label: 'Tong Tokyo' }],
        audience: 'language learners',
        tone: 'textural',
        platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 305,
      },
      { fetcher }
    );

    expect(result).toMatchObject({
      status: 'ready',
      requestedInputs: [],
      workflow: {
        workflowId: 'website-to-video',
        reason: 'site source selected a website video workflow',
      },
    });
    expect(result.workflow.plan.gates.map((gate) => gate.id)).toEqual([
      'plan',
      'drafts',
      'capture',
      'timeline',
      'render',
      'export',
    ]);
    expect(result.project).toMatchObject({
      id: 'motion-tong-demo',
      title: 'Tong Tokyo demo video',
      workflowMode: 'review',
      brief: {
        projectKind: 'demo',
        appProfile: {
          name: 'Tong Tokyo',
          siteUrl: 'https://tong.app/tokyo',
          summary: 'site evidence',
          stack: ['React', 'TypeScript'],
        },
      },
    });
    expect(result.project?.sourceRefs).toEqual([
      { kind: 'site', ref: 'https://tong.app/tokyo' },
    ]);
    expect(result.project?.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(result.project?.graphNodes.map((node) => node.kind)).toEqual([
      'capture',
      'script',
      'storyboard',
      'sync',
    ]);
    expect(result.capturePlan).toMatchObject({
      status: 'ready',
      preferredPath: 'screenshot-first',
      target: { kind: 'url', ref: 'https://tong.app/tokyo' },
    });
    expect(result.capturePlan?.requests.map((request) => request.request.mode)).toEqual([
      'screenshot',
      'dom-snapshot',
      'interaction-trace',
      'screen-recording',
    ]);
    expect(result.reviewPlan).toMatchObject({
      projectId: 'motion-tong-demo',
      primaryAction: 'request-review',
      summary: {
        appName: 'Tong Tokyo',
        projectKind: 'demo',
      },
    });
    expect(
      result.reviewPlan?.componentSlots.some((slot) => slot.componentId === 'app-frame')
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://tong.app/tokyo');
  });

  it('starts a local repo path as an editable repo video plan', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'aether-start-local-'));
    tempDirs.push(repoPath);
    await mkdir(join(repoPath, 'src'), { recursive: true });
    await writeFile(
      join(repoPath, 'package.json'),
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
      })
    );
    await writeFile(
      join(repoPath, 'README.md'),
      'Tong is a Next.js, React, and TypeScript language-learning app.'
    );
    await writeFile(join(repoPath, 'src', 'page.tsx'), 'export default function Page() {}');
    const fetcher = vi.fn<typeof fetch>();

    const result = await startAgentMotionWorkflow(
      {
        id: 'motion-tong-launch',
        workspaceId: 'demo-ws',
        intent: 'launch',
        mode: 'review',
        sourceRefs: [{ kind: 'repo', ref: repoPath, label: 'Tong local repo' }],
        audience: 'language learners',
        tone: 'textural',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 308,
      },
      { fetcher }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'ready',
      requestedInputs: [],
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
    });
    expect(result.project?.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(result.previewPlan).toMatchObject({
      projectId: 'motion-tong-launch',
      primaryAction: 'request-review',
      enginePreviews: [
        { engine: 'remotion', status: 'ready' },
        { engine: 'hyperframes', status: 'ready' },
        { engine: 'provider', status: 'provider-required' },
      ],
    });
  });

  it('starts a PR-to-video workflow when a code-change provider is available', async () => {
    const ingest = vi.fn<CodeChangeProvider['ingest']>(async () => ({
      providerId: 'test-code-change',
      title: 'Add PR explainer videos',
      files: [
        {
          path: 'lib/motion/start.ts',
          status: 'modified',
          additions: 42,
          deletions: 4,
          language: 'TypeScript',
        },
      ],
      hunks: [
        {
          id: 'hunk-lib-motion-start-ts-32',
          filePath: 'lib/motion/start.ts',
          newStart: 32,
          lines: ['+return await buildPrMotionProjectFromSource(input);'],
          provenance: [{ kind: 'code-change', ref: 'diff:lib/motion/start.ts#32' }],
        },
      ],
      commits: [{ sha: 'abc123', message: 'Add PR motion start' }],
      reviews: [{ reviewer: 'reviewer', state: 'approved' }],
      ci: [{ name: 'typecheck', status: 'passed' }],
      provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#123' }],
    }));
    const codeChangeProvider: CodeChangeProvider = {
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
          description: 'Canvas-native creative system.',
          stargazers_count: 42,
          forks_count: 7,
          open_issues_count: 3,
          pushed_at: '2026-06-09T10:22:00Z',
          topics: ['nextjs', 'convex', 'tldraw'],
        });
      }
      if (href.endsWith('/languages')) {
        return githubJson({ TypeScript: 1000, CSS: 200 });
      }
      if (href.endsWith('/releases?per_page=5')) return githubJson([]);
      if (href.endsWith('/readme')) {
        return githubText('A Next.js 15, Convex, and tldraw creative canvas.');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await startAgentMotionWorkflow(
      {
        id: 'motion-pr-123',
        workspaceId: 'demo-ws',
        intent: 'launch',
        mode: 'full-auto',
        sourceRefs: [
          { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
          { kind: 'pr', ref: 'https://github.com/erniesg/aether/pull/123' },
        ],
        audience: 'maintainers',
        tone: 'crisp',
        platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
        createdAt: 310,
      },
      { codeChangeProvider, fetcher }
    );

    expect(result).toMatchObject({
      status: 'ready',
      workflow: {
        workflowId: 'pr-to-video',
        reason: 'pull request source selected a code-change workflow',
      },
    });
    expect(result.workflow.plan).toMatchObject({
      mode: 'full-auto',
      primaryAction: 'run-full-auto',
      sourceStatus: 'ready',
      runPlan: {
        status: 'ready',
        primaryAction: 'run-full-auto',
      },
    });
    expect(result.workflow.plan.runPlan.steps.every((step) => step.autoAdvance)).toBe(true);
    expect(result.project).toMatchObject({
      id: 'motion-pr-123',
      title: 'aether PR video',
      workflowMode: 'full-auto',
      brief: { projectKind: 'pr' },
    });
    expect(result.project?.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(result.reviewPlan).toMatchObject({
      projectId: 'motion-pr-123',
      primaryAction: 'queue-render',
      summary: {
        appName: 'aether',
        projectKind: 'pr',
      },
    });
    expect(result.examples).toEqual([
      expect.objectContaining({
        id: 'daily-skill-launch-pr-to-video',
        label: 'Daily skill launch: PR-to-video',
        reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
        editSurfaces: [
          'script',
          'code-evidence',
          'component',
          'voice',
          'timing',
          'effect',
          'export',
        ],
      }),
    ]);
    expect(result.examples[0].sampleCopyLines).toContain('npx skills add heygen-com/hyperframes');
    expect(result.capturePlan).toBeNull();
    expect(result.requestedInputs).toEqual([]);
  });

  it('keeps PR starts on code-change evidence before creating a project without a provider', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const result = await startAgentMotionWorkflow(
      {
        id: 'motion-pr-123',
        workspaceId: 'demo-ws',
        intent: 'launch',
        mode: 'full-auto',
        sourceRefs: [
          { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
          { kind: 'pr', ref: 'https://github.com/erniesg/aether/pull/123' },
        ],
        audience: 'maintainers',
        tone: 'crisp',
        platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
        createdAt: 310,
      },
      { fetcher }
    );

    expect(result.status).toBe('needs-evidence');
    expect(result.workflow).toMatchObject({
      workflowId: 'pr-to-video',
      reason: 'pull request source selected a code-change workflow',
    });
    expect(result.workflow.plan).toMatchObject({
      mode: 'full-auto',
      primaryAction: 'run-full-auto',
      sourceStatus: 'ready',
    });
    expect(result.project).toBeNull();
    expect(result.reviewPlan).toBeNull();
    expect(result.examples).toEqual([
      expect.objectContaining({
        id: 'daily-skill-launch-pr-to-video',
        storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
      }),
    ]);
    expect(result.requestedInputs).toEqual([
      {
        kind: 'code-change',
        label: 'Collect PR evidence',
        sourceRef: { kind: 'pr', ref: 'https://github.com/erniesg/aether/pull/123' },
        toolId: 'motion-brief',
      },
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requests source material when routing has no usable source refs', async () => {
    const result = await startAgentMotionWorkflow({
      id: 'motion-tong-social',
      workspaceId: 'demo-ws',
      intent: 'social',
      mode: 'review',
      sourceRefs: [],
      audience: 'language learners',
      tone: 'textural',
      platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 320,
    });

    expect(result).toMatchObject({
      status: 'needs-source',
      project: null,
      reviewPlan: null,
      workflow: {
        workflowId: 'feature-social-video',
      },
    });
    expect(result.requestedInputs).toEqual([
      {
        kind: 'source',
        label: 'Add repo, site, capture, upload, or reference',
        missingSourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
      },
    ]);
  });
});
