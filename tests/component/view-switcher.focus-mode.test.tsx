import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/app/design-system/ThemeProvider';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { resetRunsForTests } from '@/lib/store/runs';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import {
  resetMotionStartResultsForTests,
  setMotionStartResult,
} from '@/lib/motion/start-store';
import { buildAgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { buildAgentMotionWorkflowPlan } from '@/lib/motion/workflowPlan';

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

  it('timeline regeneration button plans a scoped agent handoff and refreshes motion state', async () => {
    const start = storedRegeneratableMotionStart();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          project: start.project,
          reviewPlan: start.reviewPlan,
          previewPlan: start.previewPlan,
          capturePlan: start.capturePlan,
          regenerationRequest: {
            scope: 'capture',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    setMotionStartResult('demo-ws', start);
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    await userEvent.click(screen.getByRole('button', { name: /regenerate capture for app frame/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('capture regeneration planned');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/motion/regenerate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"clipId":"clip-beat-demo-text"'),
      })
    );
  });

  it('timeline draft cards switch the stored motion project to that variation', async () => {
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
