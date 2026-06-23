import { describe, expect, it, vi } from 'vitest';
import { startAgentMotionWorkflow } from './start';

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
    });
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

  it('keeps PR starts on code-change evidence before creating a project', async () => {
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
