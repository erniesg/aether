import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/app/design-system/ThemeProvider';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { resetRunsForTests } from '@/lib/store/runs';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import {
  getMotionStartResult,
  resetMotionStartResultsForTests,
  setMotionStartResult,
} from '@/lib/motion/start-store';
import { buildAgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import { buildMotionAgentExecutionHandoff } from '@/lib/motion/agentHandoff';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { buildAgentMotionWorkflowPlan } from '@/lib/motion/workflowPlan';
import { appendSetupDryRunExecutionHistory } from '@/lib/motion/executionHistory';
import type { MotionSourcePatchDraft } from '@/lib/motion/sourcePatchDraft';
import type { MotionProject, TimelineTrack } from '@/lib/motion/project';

afterEach(() => {
  cleanup();
  resetRunsForTests();
  resetMotionStartResultsForTests();
  vi.restoreAllMocks();
});

function renderShell() {
  return render(
    <ThemeProvider>
      <WorkspaceShell wsId="demo-ws" />
    </ThemeProvider>
  );
}

function storedMotionStart(): AgentMotionStartResult {
  return {
    status: 'ready',
    workflow: {
      workflowId: 'repo-launch-video',
      reason: 'repo source selected a launch workflow',
      plan: buildAgentMotionWorkflowPlan({
        workflowId: 'repo-launch-video',
        mode: 'review',
        sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
        requestedEngines: ['remotion', 'hyperframes', 'provider'],
        createdAt: 1,
      }),
    },
    project: {
      brief: {
        appProfile: {
          name: 'aether',
        },
      },
      tracks: [
        {
          id: 'track-text',
          kind: 'text',
          clips: [
            {
              id: 'clip-hook',
              componentId: 'hook-card',
              startFrame: 0,
              durationFrames: 90,
              props: { headline: 'Aether launch video' },
              linkedVariantScope: 'global',
              provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
            },
          ],
        },
      ],
    },
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    examples: [],
    requestedInputs: [],
  } as unknown as AgentMotionStartResult;
}

function storedRegeneratableMotionStart(): AgentMotionStartResult {
  const project = materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
  const previewPlan = buildMotionPreviewPlan(project, {
    engines: ['remotion', 'hyperframes', 'provider'],
    requestedAt: 82,
  });

  return {
    status: 'ready',
    workflow: {
      workflowId: 'repo-launch-video',
      reason: 'repo source selected a launch workflow',
      plan: buildAgentMotionWorkflowPlan({
        workflowId: 'repo-launch-video',
        mode: 'review',
        sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
        requestedEngines: ['remotion', 'hyperframes', 'provider'],
        createdAt: 1,
      }),
    },
    project,
    reviewPlan: null,
    previewPlan,
    capturePlan: null,
    agentHandoff: null,
    examples: [],
    requestedInputs: [],
  };
}

function storedFullAutoMotionStart(): AgentMotionStartResult {
  const start = storedRegeneratableMotionStart();
  const project = {
    ...start.project!,
    workflowMode: 'full-auto' as const,
  };
  const workflow = {
    workflowId: 'repo-launch-video' as const,
    reason: 'repo source selected a launch workflow',
    plan: buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'full-auto',
      sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      requestedEngines: ['remotion', 'hyperframes', 'provider'],
      createdAt: 1,
    }),
  };
  const capturePlan = buildAgentMotionCapturePlan(project);
  const normalizedCapturePlan = capturePlan.status === 'not-needed' ? null : capturePlan;

  return {
    ...start,
    workflow,
    project,
    previewPlan: buildMotionPreviewPlan(project, {
      engines: workflow.plan.engines,
      workflowRunPlan: workflow.plan.runPlan,
      requestedAt: 84,
    }),
    capturePlan: normalizedCapturePlan,
    agentHandoff: buildMotionAgentExecutionHandoff({
      workflow,
      project,
      capturePlan: normalizedCapturePlan,
    }),
  };
}

function storedLocalAppFullAutoMotionStart(): AgentMotionStartResult {
  const project = materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-tong-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'full-auto',
      audience: 'language learners',
      tone: 'textural',
      appProfile: {
        name: 'tong',
        repoUrl: '/Users/erniesg/code/erniesg/tong',
        summary: 'City-specific language learning app.',
        stack: ['TypeScript', 'Next.js'],
      },
      sourceProfile: {
        kind: 'local-repo',
        label: 'tong source material',
        sourceRef: '/Users/erniesg/code/erniesg/tong',
        summary: 'local repo with a runnable app route',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-local-app-still',
            label: 'Capture local app route /',
            mode: 'screenshot',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: '/Users/erniesg/code/erniesg/tong',
            reason: 'Local repo exposes an app route suitable for a product still.',
            provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
          },
        ],
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
      },
      claims: [
        {
          text: 'tong uses Next.js and TypeScript for a local product surface.',
          source: { kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 90,
    }),
    { updatedAt: 91 }
  );
  const workflow = {
    workflowId: 'repo-launch-video' as const,
    reason: 'repo source selected a launch workflow',
    plan: buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'full-auto',
      sourceRefs: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
      requestedEngines: ['remotion', 'hyperframes', 'provider'],
      createdAt: 1,
    }),
  };
  const capturePlan = buildAgentMotionCapturePlan(project);
  const normalizedCapturePlan = capturePlan.status === 'not-needed' ? null : capturePlan;

  return {
    status: 'ready',
    workflow,
    project,
    reviewPlan: null,
    previewPlan: buildMotionPreviewPlan(project, {
      engines: workflow.plan.engines,
      workflowRunPlan: workflow.plan.runPlan,
      requestedAt: 92,
    }),
    capturePlan: normalizedCapturePlan,
    agentHandoff: buildMotionAgentExecutionHandoff({
      workflow,
      project,
      capturePlan: normalizedCapturePlan,
    }),
    examples: [],
    requestedInputs: [],
  };
}

/**
 * Focus is a lens — a camera/selection change on the same project, not a
 * chrome toggle. Rails stay mounted (brand, offer, campaign, refs, signals
 * on the left; versions, formats, generations on the right). The shell
 * switches the tldraw camera target via focusFrameAtIndex() — that
 * side-effect path is unit-tested in lib/canvas/focusFrame.test.ts. Here we
 * verify the pill state transitions and the fact that rails are untouched.
 */
describe('ViewSwitcher · focus lens = camera, not chrome', () => {
  it('both rails stay mounted in canvas view (default)', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('clicking the focus pill does NOT hide the rails — context stays visible', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^focus/i }));

    // Rails stay. This is the contract: focus is about the canvas camera,
    // not the shell layout. Creators still need brand/campaign/refs while
    // zoomed into a single artboard.
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('clicking the timeline pill opens the timeline lens inside the same shell', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));

    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('Repo app launch')).toBeInTheDocument();
    expect(screen.getByText('Feature social cut')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('timeline lens reads a stored motion start result from the workspace', async () => {
    setMotionStartResult('demo-ws', storedMotionStart());
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));

    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('Hook card')).toBeInTheDocument();
    expect(screen.getByText('Aether launch video')).toBeInTheDocument();
    expect(screen.queryByText('clip-hook')).not.toBeInTheDocument();
  });

  it('opens the timeline lens automatically when a motion preview plan is ready', async () => {
    setMotionStartResult('demo-ws', storedRegeneratableMotionStart());
    renderShell();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^timeline/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getAllByText('aether launch video').length).toBeGreaterThan(0);
    expect(screen.getByText('Primary launch cut')).toBeInTheDocument();
  });

  it('surfaces stored motion source patch drafts in the timeline lens', async () => {
    const sourcePatchDraft: MotionSourcePatchDraft = {
      id: 'source-patch-draft-stored',
      status: 'ready',
      route: '/api/motion/source-edit',
      method: 'POST',
      sourceEditId: 'source-edit-stored',
      sourcePatchPlanId: 'source-patch-stored',
      files: [
        {
          path: 'timeline/draft-primary.json',
          contents: '{"tracks":[]}',
        },
      ],
      targetClipIds: ['clip-beat-demo-text'],
      requestTemplate: {
        project: '$motionProject',
        id: 'source-edit-stored',
        files: '$draftSourceFiles',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
      blockers: [],
    };
    const start = {
      ...storedRegeneratableMotionStart(),
      sourcePatchDraft,
    } as AgentMotionStartResult;
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));

    await waitFor(() => {
      expect(screen.getByText('source patch draft')).toBeInTheDocument();
    });
    expect(screen.getAllByText('source-edit-stored').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /apply source patch draft/i })).toBeEnabled();
  });

  it('timeline regeneration button plans a scoped agent handoff and refreshes motion state', async () => {
    const start = storedRegeneratableMotionStart();
    const sourcePatchDraft = {
      id: 'source-patch-draft-regen-capture',
      status: 'ready',
      route: '/api/motion/source-edit',
      method: 'POST',
      sourceEditId: 'source-edit-regen-capture',
      sourcePatchPlanId: 'source-patch-regen-capture',
      files: [
        {
          path: 'timeline/draft-primary.json',
          contents: '{"tracks":[]}',
        },
      ],
      targetClipIds: ['clip-beat-demo-text'],
      requestTemplate: {
        project: '$motionProject',
        id: 'source-edit-regen-capture',
        files: '$draftSourceFiles',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
      blockers: [],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/motion/regenerate')) {
        return new Response(
          JSON.stringify({
            ok: true,
            project: start.project,
            reviewPlan: start.reviewPlan,
            previewPlan: start.previewPlan,
            capturePlan: start.capturePlan,
            sourcePatchDraft,
            regenerationRequest: {
              scope: 'capture',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/motion/source-edit')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'applied',
            project: start.project,
            reviewPlan: start.reviewPlan,
            previewPlan: start.previewPlan,
            appliedEdits: [],
            blockers: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /regenerate capture for app frame/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('capture regeneration planned');
    });
    await waitFor(() => {
      expect(screen.getByText('source patch draft')).toBeInTheDocument();
    });
    expect(screen.getAllByText('source-edit-regen-capture').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/regenerate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"clipId":"clip-beat-demo-text"'),
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /apply source patch draft/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('source patch applied');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/source-edit',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"id":"source-edit-regen-capture"'),
      })
    );
  });

  it('timeline draft cards switch and approve the stored motion project variation', async () => {
    setMotionStartResult('demo-ws', storedRegeneratableMotionStart());
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    const demoFirst = screen.getByRole('button', { name: /demo-first cut/i });
    expect(demoFirst).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(demoFirst);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Demo-first cut selected');
    });
    expect(screen.getByRole('button', { name: /demo-first cut/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    const approveDraft = screen.getByRole('button', { name: /approve current draft/i });
    expect(approveDraft).toBeEnabled();
    await userEvent.click(approveDraft);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Demo-first cut approved');
    });
    expect(screen.getByRole('button', { name: /current draft approved/i })).toBeDisabled();

    const approvedStart = getMotionStartResult('demo-ws');
    expect(approvedStart?.project?.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'drafts',
          label: 'Approve draft variation Demo-first cut',
          receiptLabels: ['Draft approval', 'Approved timeline'],
        }),
      ])
    );
  });

  it('timeline voice action requests synthesis and reports provider handoff state', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'provider-required',
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          providers: [],
          selectedRequests: [],
          voiceResults: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /generate voice/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('voice provider required');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/voice',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"draftId":"draft-primary"'),
      })
    );
  });

  it('timeline sync action requests timing and reports voice blockers', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          syncPlan: { status: 'needs-voice' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /sync timeline/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('voice required before sync');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/sync',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"draftId":"draft-primary"'),
      })
    );
  });

  it('timeline render action requests a proof render and reports provider handoff state', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'provider-required',
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          providers: [],
          request: { engine: 'remotion' },
          renderResult: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /render remotion/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('remotion renderer required');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/render',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"engine":"remotion"'),
      })
    );
  });

  it('timeline export action checks pack readiness and reports missing render assets', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          exportPackPlan: {
            status: 'needs-render',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /export pack/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('render required before export');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/export-pack',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"requestedEngines":["remotion","hyperframes","provider"]'),
      })
    );
  });

  it('timeline image-to-video action plans visual sources before clip generation', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'ready',
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          visualSourcingPlan: {
            status: 'ready',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    expect(screen.getByText('repo ingest')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /plan visuals/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('visual sources planned');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/visuals',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"draftId":"draft-primary"'),
      })
    );
  });

  it('timeline selected app frame applies capture source, caption, and zoom edits', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          capturePlan: start.capturePlan,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /app frame clip/i }));
    await userEvent.type(screen.getByLabelText(/clip capture asset/i), 'capture://fresh-demo');
    await userEvent.clear(screen.getByLabelText(/clip caption/i));
    await userEvent.type(screen.getByLabelText(/clip caption/i), 'Fresh product flow');
    await userEvent.clear(screen.getByLabelText(/clip zoom/i));
    await userEvent.type(screen.getByLabelText(/clip zoom/i), '1.35');
    await userEvent.click(screen.getByRole('button', { name: /apply source controls/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('clip source updated');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/revise',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const reviseCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/revise');
    const body = JSON.parse(String(reviseCall?.[1]?.body));
    expect(body.operations).toEqual([
      {
        kind: 'update-clip-props',
        clipId: 'clip-beat-demo-text',
        props: {
          assetId: 'capture://fresh-demo',
          caption: 'Fresh product flow',
          zoom: 1.35,
        },
      },
    ]);
  });

  it('timeline selected app frame applies keyframed crop zoom and cursor edits', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          capturePlan: start.capturePlan,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /app frame clip/i }));
    fireEvent.change(screen.getByLabelText(/clip source keyframes/i), {
      target: {
        value: JSON.stringify([
        { atFrame: 0, crop: 'wide-context', zoom: 1, cursorPath: '120,420' },
        { atFrame: 72, crop: 'center-safe', zoom: 1.45, cursorPath: '120,420 540,960' },
        ]),
      },
    });
    await userEvent.click(screen.getByRole('button', { name: /apply source keyframes/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('source keyframes updated');
    });

    const reviseCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/revise');
    const body = JSON.parse(String(reviseCall?.[1]?.body));
    expect(body.operations).toEqual([
      {
        kind: 'update-clip-source-keyframes',
        clipId: 'clip-beat-demo-text',
        keyframes: [
          { atFrame: 0, crop: 'wide-context', zoom: 1, cursorPath: '120,420' },
          { atFrame: 72, crop: 'center-safe', zoom: 1.45, cursorPath: '120,420 540,960' },
        ],
      },
    ]);
  });

  it('advanced node lens scopes visual-source regeneration to one request', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'ready',
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          visualSourcingPlan: {
            status: 'ready',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /open node lens/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /regenerate find motion references/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('visual sources planned');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/visuals',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(
          '"requestIds":["visual-source-reference-search"]'
        ),
      })
    );
  });

  it('advanced node lens scopes image-to-video generation to one request', async () => {
    const start = storedRegeneratableMotionStart();
    const attachVisualSource = (tracks: TimelineTrack[]) =>
      tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === 'clip-beat-demo-text'
            ? {
                ...clip,
                assetId: 'capture-screenshot-aether-localhost',
                props: {
                  ...clip.props,
                  assetUrl: 'asset://capture/aether-home.png',
                  captureArtifactKind: 'screenshot',
                  captureProviderId: 'browser-capture',
                  mimeType: 'image/png',
                  width: 1080,
                  height: 1920,
                },
              }
            : clip
        ),
      }));
    const projectWithVisualSource: MotionProject = {
      ...start.project!,
      tracks: attachVisualSource(start.project!.tracks),
      drafts: start.project!.drafts.map((draft) =>
        draft.id === start.project!.currentDraftId
          ? { ...draft, tracks: attachVisualSource(draft.tracks) }
          : draft
      ),
    };
    const previewPlan = buildMotionPreviewPlan(projectWithVisualSource, {
      engines: start.workflow.plan.engines,
      requestedAt: 95,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'generated-for-review',
          project: projectWithVisualSource,
          reviewPlan: start.reviewPlan,
          previewPlan,
          imageToVideoPlan: {
            status: 'ready',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', {
      ...start,
      project: projectWithVisualSource,
      previewPlan,
    });
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /open node lens/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /generate app frame video clip/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('video takes ready for review');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/image-to-video',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(
          '"requestIds":["image-to-video-clip-beat-demo-text"]'
        ),
      })
    );
  });

  it('timeline capture action requests required app captures and reports provider handoff state', async () => {
    const start = storedRegeneratableMotionStart();
    const project = {
      ...start.project!,
      sourceRefs: [
        ...start.project!.sourceRefs,
        { kind: 'site' as const, ref: 'https://aether.local/demo' },
      ],
    };
    const capturePlan = buildAgentMotionCapturePlan(project);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'provider-required',
          project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          capturePlan,
          providers: [],
          selectedRequests: [],
          captureResults: [],
          captureResult: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', {
      ...start,
      project,
      capturePlan,
      agentHandoff: {
        id: 'handoff-motion-aether-launch',
        projectId: project.id,
        workflowId: 'repo-launch-video',
        mode: 'review',
        nextTemplateId: 'review-capture',
        sourceLabels: ['aether local repo'],
        templates: [
          {
            id: 'review-capture',
            label: 'Capture product media',
            method: 'POST',
            route: '/api/motion/capture',
            toolId: 'motion-capture',
            body: {
              project: '$motionProject',
              requestIds: ['capture-home-still', 'capture-dom-snapshot'],
              captureRunner: {
                kind: 'playwright-local',
                outputDir: 'outputs/motion-captures/motion-aether-launch',
                launchLocalApp: true,
                headless: true,
              },
            },
            inputPlaceholders: ['$motionProject'],
            expectedReceipts: ['screenshot', 'viewport receipt'],
          },
        ],
      },
    });
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /capture stills/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('capture provider required');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/capture',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(
          '"requestIds":["capture-home-still","capture-dom-snapshot"]'
        ),
      })
    );
    const captureCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/capture');
    const captureBody = JSON.parse(String(captureCall?.[1]?.body));
    expect(captureBody.captureRunner).toEqual({
      kind: 'playwright-local',
      outputDir: 'outputs/motion-captures/motion-aether-launch',
      launchLocalApp: true,
      headless: true,
    });
  });

  it('timeline pin skill action opens a motion-specific reusable skill draft', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          manifest: {
            name: 'repo-launch-video',
            version: 1,
            description: 'Turn a repo into an editable launch video.',
            tools: ['motion-brief', 'motion-storyboard', 'motion-render'],
            referenceFiles: [],
            instructions:
              '# repo-launch-video\n\nDraft a launch video.\n\n## Output format\n\n```json\n{ "ok": true, "result": {} }\n```',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /^pin skill$/i }));

    expect(await screen.findByTestId('skill-accept-name')).toHaveValue('repo-launch-video');
    expect(screen.getByTestId('skill-accept-description')).toHaveTextContent(
      'Repo launch video skill for editable, provenance-rich motion videos.'
    );
    const draftCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/capability/draft-skill'
    );
    expect(draftCall).toBeUndefined();
  });

  it('timeline full-auto action runs the saved-gates agent handoff and refreshes status', async () => {
    const start = storedFullAutoMotionStart();
    const returnedProject = {
      ...start.project!,
      executionHistory: [
        {
          id: 'execution-capture-browser-test-901',
          gateId: 'capture' as const,
          label: 'Product capture',
          providerId: 'browser-test',
          savedAt: 901,
          receiptCount: 1,
          receiptLabels: ['Screenshot'],
          receipts: [],
          provenance: [{ kind: 'provider' as const, ref: 'browser-test' }],
        },
      ],
    };
    const returnedPreview = buildMotionPreviewPlan(returnedProject, {
      engines: start.workflow.plan.engines,
      workflowRunPlan: start.workflow.plan.runPlan,
      requestedAt: 901,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'complete',
          projectId: returnedProject.id,
          finalProject: returnedProject,
          finalResponse: {
            ok: true,
            status: 'paused',
            project: returnedProject,
            reviewPlan: start.reviewPlan,
            previewPlan: returnedPreview,
            run: {
              status: 'paused',
              reason: 'provider-required',
              stepLabel: 'Voice and captions',
              advancedStepIds: ['capture'],
            },
          },
          steps: [
            {
              templateId: 'full-auto-run',
              label: 'Run saved gates',
              route: '/api/motion/full-auto',
              method: 'POST',
              missingPlaceholders: [],
              status: 'complete',
              responseStatus: 200,
              responseJson: {},
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /run full auto/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'full auto paused at Voice and captions'
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/agent-handoff',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const handoffCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/motion/agent-handoff'
    );
    const body = JSON.parse(String(handoffCall?.[1]?.body));
    expect(body.project.id).toBe('motion-aether-launch');
    expect(body.handoff.nextTemplateId).toBe('full-auto-run');
    expect(body.templateIds).toEqual(['full-auto-run']);
  });

  it('timeline full-auto handoff shows missing provider placeholders in the shell', async () => {
    const start = storedFullAutoMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'blocked',
          projectId: start.project!.id,
          finalProject: start.project,
          finalResponse: null,
          steps: [
            {
              templateId: 'full-auto-run',
              label: 'Run saved gates',
              route: '/api/motion/full-auto',
              method: 'POST',
              missingPlaceholders: ['$voiceProviderId', '$renderProviderId'],
              status: 'skipped',
              responseStatus: null,
              responseJson: null,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /run full auto/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'full auto blocked: missing $voiceProviderId, $renderProviderId'
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/agent-handoff',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('timeline setup cards select a missing runner inside the same shell', async () => {
    setMotionStartResult('demo-ws', storedFullAutoMotionStart());
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /set up product capture/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Product capture setup selected');
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('timeline setup cards run matching dry-run handoffs and refresh receipts', async () => {
    const start = storedLocalAppFullAutoMotionStart();
    expect(start.agentHandoff?.templates.map((template) => template.id)).toContain(
      'setup-local-app'
    );
    const returnedProject = {
      ...start.project!,
      executionHistory: appendSetupDryRunExecutionHistory(
        start.project!.executionHistory,
        {
          setupId: 'local-app',
          gateId: 'capture',
          label: 'Local app runner',
          receiptLabels: ['HTTP readiness receipt', 'process cleanup receipt'],
          providerId: 'browser-capture',
          provenance: [
            { kind: 'provider', ref: 'browser-capture' },
            { kind: 'manual', ref: 'setup-dry-run:local-app' },
          ],
        },
        903
      ),
      updatedAt: 903,
    };
    const returnedPreview = buildMotionPreviewPlan(returnedProject, {
      engines: start.workflow.plan.engines,
      workflowRunPlan: start.workflow.plan.runPlan,
      requestedAt: 903,
    });
    const returnedHandoff = buildMotionAgentExecutionHandoff({
      workflow: start.workflow,
      project: returnedProject,
      capturePlan: start.capturePlan,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'complete',
          projectId: returnedProject.id,
          finalProject: returnedProject,
          finalResponse: {
            ok: true,
            status: 'paused',
            project: returnedProject,
            reviewPlan: start.reviewPlan,
            previewPlan: returnedPreview,
            capturePlan: start.capturePlan,
            agentHandoff: returnedHandoff,
            setupDryRun: {
              setupId: 'local-app',
              gateId: 'capture',
              receiptLabels: ['HTTP readiness receipt', 'process cleanup receipt'],
            },
          },
          steps: [
            {
              templateId: 'setup-local-app',
              label: 'Dry-run local app runner',
              route: '/api/motion/full-auto',
              method: 'POST',
              missingPlaceholders: [],
              status: 'complete',
              responseStatus: 200,
              responseJson: {},
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /set up local app runner/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Local app runner setup saved');
    });
    const handoffCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/motion/agent-handoff'
    );
    expect(handoffCall).toBeDefined();
    const body = JSON.parse(String(handoffCall?.[1]?.body));
    expect(body.project.id).toBe('motion-tong-launch');
    expect(body.templateIds).toEqual(['setup-local-app']);
    expect(body.input).toEqual({});
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('timeline computer-use setup card pauses until approval and redaction receipts exist', async () => {
    const start = storedLocalAppFullAutoMotionStart();
    expect(start.agentHandoff?.templates.map((template) => template.id)).toContain(
      'setup-computer-use'
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'blocked',
          projectId: start.project!.id,
          finalProject: start.project,
          finalResponse: null,
          steps: [
            {
              templateId: 'setup-computer-use',
              label: 'Approve computer-use capture',
              route: '/api/motion/full-auto',
              method: 'POST',
              missingPlaceholders: ['$computerUseCaptureRunner'],
              status: 'skipped',
              responseStatus: null,
              responseJson: null,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /set up computer-use capture/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Computer-use capture setup blocked: missing $computerUseCaptureRunner'
      );
    });
    const handoffCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/motion/agent-handoff'
    );
    expect(handoffCall).toBeDefined();
    const body = JSON.parse(String(handoffCall?.[1]?.body));
    expect(body.templateIds).toEqual(['setup-computer-use']);
    expect(body.input).toEqual({});
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('timeline source preview focuses a component without leaving the shell', async () => {
    setMotionStartResult('demo-ws', storedRegeneratableMotionStart());
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    expect(screen.getByText('playable preview')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /focus hook card/i }));

    expect(screen.getByLabelText(/selected clip summary/i)).toHaveValue(
      'aether: Canvas-native creative system.'
    );
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('advanced node lens opens from the timeline while the graph route stays unavailable', async () => {
    setMotionStartResult('demo-ws', storedRegeneratableMotionStart());
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /open node lens/i }));

    expect(screen.getByText('advanced node lens')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^graph/i })).toBeDisabled();
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('selected timeline clip edits call revise and refresh the preview', async () => {
    const start = storedRegeneratableMotionStart();
    const revisedPreview = {
      ...start.previewPlan!,
      timelineRows: start.previewPlan!.timelineRows.map((row) => ({
        ...row,
        clips: row.clips.map((clip) =>
          clip.clipId === 'clip-beat-hook-text'
            ? { ...clip, summary: 'Repo to launch cuts' }
            : clip
        ),
      })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: revisedPreview,
          capturePlan: start.capturePlan,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /hook card clip/i })[0]);
    const input = screen.getByLabelText(/selected clip summary/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Repo to launch cuts');
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('clip updated');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/revise',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"kind":"update-clip-props"'),
      })
    );
    const reviseCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/revise');
    expect(reviseCall?.[1]?.body).toEqual(
      expect.stringContaining('"clipId":"clip-beat-hook-text"')
    );
    expect(screen.getByDisplayValue('Repo to launch cuts')).toBeInTheDocument();
  });

  it('selected timeline clip effect edits call revise with reusable preset props', async () => {
    const start = storedRegeneratableMotionStart();
    const revisedPreview = {
      ...start.previewPlan!,
      timelineRows: start.previewPlan!.timelineRows.map((row) => ({
        ...row,
        clips: row.clips.map((clip) =>
          clip.clipId === 'clip-beat-hook-text'
            ? { ...clip, effectPreset: 'proof-pulse', effectLabel: 'proof pulse' }
            : clip
        ),
      })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: revisedPreview,
          capturePlan: start.capturePlan,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /hook card clip/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /apply proof pulse effect/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('effect updated');
    });
    const reviseCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/revise');
    expect(reviseCall?.[1]?.body).toEqual(
      expect.stringContaining('"effectPreset":"proof-pulse"')
    );
    expect(reviseCall?.[1]?.body).toEqual(
      expect.stringContaining('"transitionStyle":"proof-pulse"')
    );
  });

  it('selected timeline clip timing edits call revise with frame timing', async () => {
    const start = storedRegeneratableMotionStart();
    const revisedPreview = {
      ...start.previewPlan!,
      timelineRows: start.previewPlan!.timelineRows.map((row) => ({
        ...row,
        clips: row.clips.map((clip) =>
          clip.clipId === 'clip-beat-hook-text'
            ? { ...clip, startSeconds: 1.5, durationSeconds: 4.5 }
            : clip
        ),
      })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: revisedPreview,
          capturePlan: start.capturePlan,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /hook card clip/i })[0]);
    await userEvent.clear(screen.getByLabelText(/clip start seconds/i));
    await userEvent.type(screen.getByLabelText(/clip start seconds/i), '1.5');
    await userEvent.clear(screen.getByLabelText(/clip duration seconds/i));
    await userEvent.type(screen.getByLabelText(/clip duration seconds/i), '4.5');
    await userEvent.click(screen.getByRole('button', { name: /apply timing/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('timing updated');
    });
    const reviseCall = fetchMock.mock.calls.find((call) => call[0] === '/api/motion/revise');
    expect(reviseCall?.[1]?.body).toEqual(
      expect.stringContaining('"kind":"retime-clip"')
    );
    expect(reviseCall?.[1]?.body).toEqual(expect.stringContaining('"startFrame":45'));
    expect(reviseCall?.[1]?.body).toEqual(expect.stringContaining('"durationFrames":135'));
  });

  it('the focus pill reports aria-current after a click, canvas after another click', async () => {
    renderShell();

    const canvasPill = screen.getByRole('tab', { name: /^canvas/i });
    const focusPill = screen.getByRole('tab', { name: /^focus/i });

    expect(canvasPill).toHaveAttribute('aria-current', 'page');
    expect(focusPill).not.toHaveAttribute('aria-current');

    await userEvent.click(focusPill);
    await waitFor(() => {
      expect(focusPill).toHaveAttribute('aria-current', 'page');
    });
    expect(canvasPill).not.toHaveAttribute('aria-current');

    await userEvent.click(canvasPill);
    await waitFor(() => {
      expect(canvasPill).toHaveAttribute('aria-current', 'page');
    });
    expect(focusPill).not.toHaveAttribute('aria-current');
  });

  it('⌘+. / Ctrl+. toggles aria-current between canvas and focus', async () => {
    renderShell();
    const canvasPill = screen.getByRole('tab', { name: /^canvas/i });
    const focusPill = screen.getByRole('tab', { name: /^focus/i });

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(focusPill).toHaveAttribute('aria-current', 'page');
    });
    expect(canvasPill).not.toHaveAttribute('aria-current');

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(canvasPill).toHaveAttribute('aria-current', 'page');
    });
    expect(focusPill).not.toHaveAttribute('aria-current');
  });

  it('arrow-key cycling is only armed while the focus lens is active', async () => {
    // This guards against stray listeners in canvas lens. The side-effect
    // (zoom) is covered in focusFrame.test.ts; here we verify the wiring is
    // gated by view — no runtime error when pressing arrows in canvas mode.
    renderShell();

    // Canvas mode: arrow keys should be no-ops (no crash, no state change).
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /^canvas/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
