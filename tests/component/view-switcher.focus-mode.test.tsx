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
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

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
      plan: {
        workflowId: 'repo-launch-video',
        label: 'Repo launch video',
        artifactKind: 'video',
        mode: 'review',
        primaryAction: 'request-review',
        sourceStatus: 'ready',
        acceptedSources: [],
        unsupportedSources: [],
        missingSourceKinds: [],
        engines: ['remotion', 'hyperframes', 'provider'],
        toolIds: [],
        skillContract: null,
        gates: [],
        nextActions: [],
        createdAt: 1,
      },
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
      plan: {
        workflowId: 'repo-launch-video',
        label: 'Repo launch video',
        artifactKind: 'video',
        mode: 'review',
        primaryAction: 'request-review',
        sourceStatus: 'ready',
        acceptedSources: [],
        unsupportedSources: [],
        missingSourceKinds: [],
        engines: ['remotion', 'hyperframes', 'provider'],
        toolIds: [],
        skillContract: null,
        gates: [],
        nextActions: [],
        createdAt: 1,
      },
    },
    project,
    reviewPlan: null,
    previewPlan,
    capturePlan: null,
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
