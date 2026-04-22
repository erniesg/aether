import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatingToolbar, type ToolbarVerb } from '@/components/canvas/FloatingToolbar';

afterEach(cleanup);

describe('FloatingToolbar · AI verbs', () => {
  it('exposes the four new AI verb buttons alongside the existing palette', () => {
    render(<FloatingToolbar />);

    // Existing verbs stay.
    expect(
      screen.getByRole('button', { name: /ai · focus composer/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cutout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /relight/i })).toBeInTheDocument();

    // New verbs.
    expect(screen.getByRole('button', { name: /remove bg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^unmask/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tone/i })).toBeInTheDocument();
  });

  it('calls onVerbPress with the matching verb id for each AI-verb click', async () => {
    const onVerbPress = vi.fn<(v: ToolbarVerb) => void>();
    render(<FloatingToolbar onVerbPress={onVerbPress} />);

    await userEvent.click(screen.getByRole('button', { name: /remove bg/i }));
    await userEvent.click(screen.getByRole('button', { name: /^unmask/i }));
    await userEvent.click(screen.getByRole('button', { name: /collage/i }));
    await userEvent.click(screen.getByRole('button', { name: /^tone/i }));

    expect(onVerbPress.mock.calls.map((c) => c[0])).toEqual([
      'removebg',
      'unmask',
      'collage',
      'tone',
    ]);
  });

  it('the "AI · focus composer" button still dispatches via onAIPress (primary entrypoint, unchanged)', async () => {
    const onAIPress = vi.fn();
    const onVerbPress = vi.fn();
    render(<FloatingToolbar onAIPress={onAIPress} onVerbPress={onVerbPress} />);

    await userEvent.click(screen.getByRole('button', { name: /ai · focus composer/i }));
    expect(onAIPress).toHaveBeenCalledTimes(1);
  });
});
