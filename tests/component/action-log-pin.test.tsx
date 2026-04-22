import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionLog } from '@/components/rail/ActionLog';
import { resetRunsForTests, startRun, finishRun } from '@/lib/store/runs';

afterEach(() => {
  cleanup();
  resetRunsForTests();
  vi.restoreAllMocks();
});

describe('ActionLog pin affordance', () => {
  it('renders a pin-as-skill button on completed runs', () => {
    act(() => {
      const id = startRun({ tool: 'image-gen', provider: 'gemini', model: 'x', prompt: 'make a banner' });
      finishRun(id, { imageUrl: 'https://cdn.test/a.png', latencyMs: 100 });
    });

    render(<ActionLog onPin={() => {}} />);
    expect(screen.getByRole('button', { name: /pin as skill/i })).toBeInTheDocument();
  });

  it('does not render a pin button on running runs', () => {
    act(() => {
      startRun({ tool: 'image-gen', provider: 'gemini', model: 'x', prompt: 'still working' });
    });
    render(<ActionLog onPin={() => {}} />);
    expect(screen.queryByRole('button', { name: /pin as skill/i })).toBeNull();
  });

  it('hides the pin button when no onPin handler is supplied', () => {
    act(() => {
      const id = startRun({ tool: 'image-gen', provider: 'gemini', model: 'x', prompt: 'banner' });
      finishRun(id, { imageUrl: 'https://cdn.test/c.png', latencyMs: 100 });
    });
    render(<ActionLog />);
    expect(screen.queryByRole('button', { name: /pin as skill/i })).toBeNull();
  });

  it('invokes the onPin callback with the clicked run', async () => {
    let capturedRunId: string = '';
    act(() => {
      capturedRunId = startRun({ tool: 'image-gen', provider: 'gemini', model: 'x', prompt: 'banner' });
      finishRun(capturedRunId, { imageUrl: 'https://cdn.test/b.png', latencyMs: 100 });
    });

    const onPin = vi.fn();
    render(<ActionLog onPin={onPin} />);

    await userEvent.click(screen.getByRole('button', { name: /pin as skill/i }));
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin.mock.calls[0][0].id).toBe(capturedRunId);
  });
});
