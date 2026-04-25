/**
 * Component tests for the render-mode chip in PromptComposer.
 *
 * The chip reads "render: responsive ▾" (default) and toggles to
 * "render: variants" when clicked. The choice flows through onSubmit
 * as renderMode: 'crop' | 'fanout'.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptComposer } from '@/components/composer/PromptComposer';

afterEach(cleanup);

describe('PromptComposer · render-mode chip', () => {
  it('shows "render: responsive" chip by default', () => {
    render(<PromptComposer formatCount={4} />);

    const chip = screen.getByRole('button', { name: /render mode/i });
    expect(chip).toHaveTextContent(/responsive/i);
  });

  it('toggles to "variants" when clicked and back to "responsive" on second click', async () => {
    render(<PromptComposer formatCount={4} />);

    const chip = screen.getByRole('button', { name: /render mode/i });
    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/variants/i);

    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/responsive/i);
  });

  it('onSubmit receives renderMode="crop" when chip is "responsive"', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'morning light{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts.renderMode).toBe('crop');
  });

  it('onSubmit receives renderMode="fanout" when chip is toggled to "variants"', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /render mode/i }));

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'editorial spread{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts.renderMode).toBe('fanout');
  });

  it('chip is independent of the format-scope chip', () => {
    render(<PromptComposer formatCount={4} />);

    const renderChip = screen.getByRole('button', { name: /render mode/i });
    const scopeChip = screen.getByRole('button', { name: /format scope/i });
    expect(renderChip).not.toBe(scopeChip);
  });
});
