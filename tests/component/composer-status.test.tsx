import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import { appendRunActivity, initRunDetails } from '@/lib/store/runDetails';
import {
  STALE_ABORT_ERROR,
  failRun,
  finishRun,
  resetRunsForTests,
  startRun,
  stepRun,
} from '@/lib/store/runs';

afterEach(() => {
  cleanup();
  resetRunsForTests();
  vi.useRealTimers();
});

describe('ComposerStatus', () => {
  it('shows provider/model + expandable activity while a run is in flight', async () => {
    const runId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'a coffee ad',
    });
    initRunDetails(runId, { providerHint: 'openai', modelHint: 'gpt-image-1' });
    appendRunActivity(runId, {
      title: 'tool call made',
      detail: 'claude-opus-4-7 · generate_image · 4:5',
    });
    stepRun(runId, 'awaiting');
    const user = userEvent.setup();

    render(<ComposerStatus />);

    expect(
      screen.getByText(/generating · openai · gpt-image-1 · awaiting provider · \d+s/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show activity/i }));
    expect(screen.getByText(/tool call made/i)).toBeInTheDocument();
    expect(
      screen.getByText(/claude-opus-4-7 · generate_image · 4:5/i)
    ).toBeInTheDocument();
  });

  it('shows the resolved provider/model and latency after success', () => {
    const runId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'a coffee ad',
    });
    initRunDetails(runId, { providerHint: 'openai', modelHint: 'gpt-image-1' });
    finishRun(runId, {
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 73_700,
      status: 'ok',
    });

    render(<ComposerStatus />);

    expect(
      screen.getByText(/placed on canvas · openai · gpt-image-1 · 73.7s/i)
    ).toBeInTheDocument();
  });

  it('shows draft executor runs as neutral bookkeeping instead of errors', () => {
    startRun({
      tool: 'text-apply',
      provider: 'stub',
      model: 'stub',
      prompt: 'record text overlay intent',
      status: 'draft-executor',
    });

    render(<ComposerStatus />);

    expect(screen.getByText(/text edit recorded/i)).toBeInTheDocument();
    expect(screen.queryByText(/stub/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filters stale aborted runs without hiding the last useful status', () => {
    const okRunId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'a coffee ad',
    });
    finishRun(okRunId, {
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 1200,
      status: 'ok',
    });

    const staleRunId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'stale run',
    });
    failRun(staleRunId, STALE_ABORT_ERROR);

    render(<ComposerStatus />);

    expect(screen.getByText(/placed on canvas · openai · gpt-image-1 · 1.2s/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(STALE_ABORT_ERROR))).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps real pre-existing errors visible', () => {
    const runId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'a coffee ad',
    });
    failRun(runId, 'provider exploded', 502);

    render(<ComposerStatus />);

    expect(screen.getByRole('alert')).toHaveTextContent(/error · openai · gpt-image-1 · provider exploded/i);
  });

  it('shows per-format progress in the expanded panel during fan-out', async () => {
    const runId = startRun({
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'a campaign still life',
    });
    initRunDetails(runId, {
      providerHint: 'openai',
      modelHint: 'gpt-image-1',
      frames: [
        {
          id: 'frame_ig_post',
          label: 'IG Post',
          aspectRatio: '4:5',
          status: 'placed',
          startedAt: Date.now() - 1200,
          updatedAt: Date.now() - 200,
        },
        {
          id: 'frame_story',
          label: 'Story',
          aspectRatio: '9:16',
          status: 'running',
          startedAt: Date.now() - 1200,
          updatedAt: Date.now() - 100,
        },
      ],
    });
    stepRun(runId, 'awaiting');
    const user = userEvent.setup();

    render(<ComposerStatus />);

    await user.click(screen.getByRole('button', { name: /show activity/i }));

    expect(screen.getByText(/^formats$/i)).toBeInTheDocument();
    expect(screen.getByText(/ig post/i)).toBeInTheDocument();
    expect(screen.getByText(/story/i)).toBeInTheDocument();
    expect(screen.getByText(/placed/i)).toBeInTheDocument();
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });
});
