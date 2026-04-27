/**
 * Behavior contract for the composer's notify-mode chip.
 *
 *   - Renders "review" by default — current drag-drop behavior is to persist
 *     the synthetic campaign and ping Discord with a Post-now button.
 *   - Clicking flips to "auto-post" (single-button toggle, two states).
 *   - onSubmit receives the selected notifyMode in PromptSubmitOptions.
 *   - Schedule mode is intentionally absent — drag-drop has no agent-derived
 *     scheduleWhenLocal, so the variation card's schedule action handles it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptComposer } from '@/components/composer/PromptComposer';

afterEach(cleanup);

describe("PromptComposer · notify-mode chip", () => {
  it('shows "review" chip by default — synthetic campaign + manual Post-now', () => {
    render(<PromptComposer formatCount={4} />);
    const chip = screen.getByTestId('composer-notify-mode-toggle');
    expect(chip).toHaveTextContent(/^review$/i);
  });

  it('toggles to "auto-post" on click and back to "review" on second click', async () => {
    render(<PromptComposer formatCount={4} />);
    const chip = screen.getByTestId('composer-notify-mode-toggle');
    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/^auto-post$/i);
    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/^review$/i);
  });

  it('onSubmit receives notifyMode="review" by default', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'morning light{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts.notifyMode).toBe('review');
  });

  it('onSubmit receives notifyMode="auto-post" after the chip flips', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);
    const chip = screen.getByTestId('composer-notify-mode-toggle');
    await userEvent.click(chip);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'morning light{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts.notifyMode).toBe('auto-post');
  });
});
