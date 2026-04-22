import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptComposer } from '@/components/composer/PromptComposer';

afterEach(cleanup);

describe('PromptComposer · format-scope chip', () => {
  it('renders a scope chip that reads "apply to all · N formats" by default', () => {
    render(<PromptComposer formatCount={4} />);

    const chip = screen.getByRole('button', { name: /format scope/i });
    expect(chip).toHaveTextContent(/apply to all/i);
    expect(chip).toHaveTextContent(/4\s+formats/i);
  });

  it('flips to "only this format" when the creator clicks the scope chip', async () => {
    render(<PromptComposer formatCount={4} />);

    const chip = screen.getByRole('button', { name: /format scope/i });
    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/only this format/i);

    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/apply to all/i);
  });

  it('keeps the input-set chip as a separate element', () => {
    render(<PromptComposer formatCount={4} activeInputSet="moody" inputCount={3} />);

    // Input-set chip must still be visible and distinct from the scope chip.
    const scopeChip = screen.getByRole('button', { name: /format scope/i });
    const inputSetChip = screen.getByRole('button', { name: /^input set/i });
    expect(scopeChip).not.toBe(inputSetChip);
    expect(inputSetChip).toHaveTextContent(/moody/i);
  });

  it('onSubmit receives scope="all" by default on plain Enter', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'bright editorial mood{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts).toMatchObject({ scope: 'all' });
  });

  it('onSubmit receives scope="single" when ⇧+Enter is used as a one-shot override', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    // Type the prompt, then fire Shift+Enter via keyDown so the modifier
    // lands on the submit event. Using userEvent.keyboard so modifiers are
    // accurately modelled.
    await userEvent.type(textarea, 'bright editorial mood');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts).toMatchObject({ scope: 'single' });
  });

  it('reverts to the persistent scope setting after a ⇧-override submit (one-shot only)', async () => {
    const onSubmit = vi.fn();
    render(<PromptComposer formatCount={4} onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');

    await userEvent.type(textarea, 'first');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    await userEvent.type(textarea, 'second{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0][1]).toMatchObject({ scope: 'single' });
    expect(onSubmit.mock.calls[1][1]).toMatchObject({ scope: 'all' });
  });
});
