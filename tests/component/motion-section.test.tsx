import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionSection } from '@/components/rail/sections/MotionSection';
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
});
