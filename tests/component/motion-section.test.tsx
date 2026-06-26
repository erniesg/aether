import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MotionSection,
  type MotionStartClientRequest,
} from '@/components/rail/sections/MotionSection';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import {
  getMotionStartResult,
  resetMotionStartResultsForTests,
} from '@/lib/motion/start-store';

afterEach(() => {
  cleanup();
  resetMotionStartResultsForTests();
});

function readyResult(appName = 'aether'): AgentMotionStartResult {
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
          name: appName,
        },
      },
    },
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    examples: [],
    requestedInputs: [],
  } as unknown as AgentMotionStartResult;
}

function reviewReadyResult(appName = 'tong'): AgentMotionStartResult {
  return {
    ...readyResult(appName),
    previewPlan: {
      title: `${appName} launch video`,
      videoPlan: {
        status: 'needs-review',
        sceneCount: 2,
        totalSeconds: 30,
        scenes: [
          {
            sceneId: 'scene-hook',
            role: 'hook',
            narration: 'Turn the repo into a launch cut.',
            visualLabel: 'Hook card',
          },
          {
            sceneId: 'scene-demo',
            role: 'demo',
            narration: 'Show the app flow and export pack.',
            visualLabel: 'App frame',
          },
        ],
      },
      draftOptions: [
        {
          draftId: 'draft-proof',
          label: 'Proof-first launch',
          angle: 'Open with the strongest sourced claim.',
          isCurrent: true,
        },
        {
          draftId: 'draft-demo',
          label: 'Demo-first launch',
          angle: 'Show the working app before the proof.',
          isCurrent: false,
        },
      ],
      regenerationActions: [
        {
          id: 'regen-app-frame-capture',
          label: 'Regenerate capture for App frame',
          componentLabel: 'App frame',
          scope: 'capture',
        },
      ],
    },
    agentHandoff: {
      id: 'handoff-tong',
      projectId: 'motion-tong-launch',
      workflowId: 'repo-launch-video',
      mode: 'full-auto',
      nextTemplateId: 'full-auto-run',
      sourceLabels: ['Local repo'],
      templates: [
        {
          id: 'full-auto-run',
          label: 'Run saved gates',
          method: 'POST',
          route: '/api/motion/full-auto',
          toolId: 'motion-render',
          body: {},
          inputPlaceholders: ['$motionProject'],
          expectedReceipts: ['captures', 'voice clips', 'export pack'],
        },
      ],
    },
  } as unknown as AgentMotionStartResult;
}

describe('MotionSection', () => {
  it('starts a repo motion plan and stores the result for the workspace timeline', async () => {
    const startMotion = vi.fn(async () => readyResult('aether'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://github.com/erniesg/aether'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(screen.getByTestId('motion-status')).toHaveTextContent('aether video');
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'demo-ws',
        repoUrl: 'https://github.com/erniesg/aether',
        intent: 'launch',
        mode: 'review',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: ['remotion', 'hyperframes', 'provider'],
      })
    );
    expect(getMotionStartResult('demo-ws')).toMatchObject({
      status: 'ready',
      project: {
        brief: {
          appProfile: { name: 'aether' },
        },
      },
    });
  });

  it('can start a multi-format launch pack from one source', async () => {
    const startMotion = vi.fn(async () => readyResult('paillette'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://github.com/erniesg/paillette'
    );
    await userEvent.selectOptions(screen.getByLabelText(/motion target/i), 'launch-pack');
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/erniesg/paillette',
        platformTargets: [
          { platform: 'x', aspectRatio: '9:16', seconds: 30 },
          { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
          { platform: 'website', aspectRatio: '16:9', seconds: 60 },
        ],
      })
    );
  });

  it('can start a PR source in full-auto mode', async () => {
    const startMotion = vi.fn(async () => readyResult('aether'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'pr');
    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(screen.getByLabelText(/motion source/i), 'erniesg/aether#123');
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRefs: [{ kind: 'pr', ref: 'erniesg/aether#123', label: 'Pull request' }],
        intent: 'pr',
        mode: 'full-auto',
      })
    );
  });

  it('can start from a composed source set for a repo app video', async () => {
    const startMotion = vi.fn(async () => readyResult('tong'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      [
        'repo: /Users/erniesg/code/erniesg/tong',
        'site: http://localhost:3000/tokyo',
        'reference: https://x.com/heygen/status/123',
      ].join('\n')
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    const firstCall = startMotion.mock.calls[0] as unknown as
      | [MotionStartClientRequest]
      | undefined;
    const request = firstCall?.[0];
    expect(request).toMatchObject({
      workspaceId: 'demo-ws',
      sourceRefs: [
        {
          kind: 'repo',
          ref: '/Users/erniesg/code/erniesg/tong',
          label: 'Repo',
        },
        {
          kind: 'site',
          ref: 'http://localhost:3000/tokyo',
          label: 'Site',
        },
        {
          kind: 'reference',
          ref: 'https://x.com/heygen/status/123',
          label: 'Reference',
        },
      ],
      intent: 'launch',
      mode: 'review',
    });
    expect(request).not.toHaveProperty('repoPath');
    expect(request).not.toHaveProperty('siteUrl');
  });

  it('can start reusable source-set video workflows from the rail', async () => {
    const startMotion = vi.fn(async () => readyResult('source set'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'caption-overlay');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'upload: asset://uploads/demo-recording.mp4'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(1);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'upload',
            ref: 'asset://uploads/demo-recording.mp4',
            label: 'Upload',
          },
        ],
        intent: 'caption-overlay',
      })
    );

    cleanup();
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);
    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'motion-graphic');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://x.com/heygen/status/123'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(2);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'reference',
            ref: 'https://x.com/heygen/status/123',
            label: 'Reference',
          },
        ],
        intent: 'motion-graphic',
      })
    );

    cleanup();
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);
    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'port');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      [
        'remotion: file://renders/aether/remotion/index.tsx',
        'hyperframes: file://renders/aether/index.html',
      ].join('\n')
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(3);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'remotion',
            ref: 'file://renders/aether/remotion/index.tsx',
            label: 'Remotion',
          },
          {
            kind: 'hyperframes',
            ref: 'file://renders/aether/index.html',
            label: 'HyperFrames',
          },
        ],
        intent: 'port',
      })
    );
  });

  it('shows review artifacts and the next agent handoff after starting a video', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    expect(reviewQueue).toHaveTextContent('tong launch video');
    expect(reviewQueue).toHaveTextContent('2 scenes');
    expect(reviewQueue).toHaveTextContent('Proof-first launch');
    expect(reviewQueue).toHaveTextContent('Demo-first launch');
    expect(reviewQueue).toHaveTextContent('Regenerate capture for App frame');
    expect(reviewQueue).toHaveTextContent('Run saved gates');
    expect(
      within(reviewQueue).getByRole('button', { name: /continue full auto/i })
    ).toBeEnabled();
  });
});
