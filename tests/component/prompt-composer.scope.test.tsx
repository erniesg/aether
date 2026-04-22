import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptComposer } from '@/components/composer/PromptComposer';

afterEach(cleanup);

const FORMATS = [
  { id: 'frame_ig_post', label: 'IG Post' },
  { id: 'frame_story', label: 'Story' },
  { id: 'frame_reel', label: 'Reel cover' },
  { id: 'frame_linkedin', label: 'LinkedIn' },
];

describe('PromptComposer · format-scope chip', () => {
  it('renders a scope chip that reads "apply to all · N formats" by default', () => {
    render(<PromptComposer formatCount={4} />);

    const chip = screen.getByRole('button', { name: /format scope/i });
    expect(chip).toHaveTextContent(/apply to all/i);
    expect(chip).toHaveTextContent(/4\s+formats/i);
  });

  it('flips to "only this format" when the creator clicks the scope chip', async () => {
    render(
      <PromptComposer
        formatCount={4}
        formats={FORMATS}
        activeFormatId="frame_story"
      />
    );

    const chip = screen.getByRole('button', { name: /format scope/i });
    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/only this format/i);
    expect(screen.getByRole('combobox', { name: /active format/i })).toHaveValue(
      'frame_story'
    );

    await userEvent.click(chip);
    expect(chip).toHaveTextContent(/apply to all/i);
  });

  it('shows the active format selector when single-format scope is active', async () => {
    render(
      <PromptComposer
        formatCount={4}
        formats={FORMATS}
        activeFormatId="frame_story"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /format scope/i }));

    const selector = screen.getByRole('combobox', { name: /active format/i });
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveDisplayValue('Story');
  });

  it('lets the creator pick the active format directly from the composer', async () => {
    const onActiveFormatChange = vi.fn();
    render(
      <PromptComposer
        formatCount={4}
        formats={FORMATS}
        activeFormatId="frame_story"
        onActiveFormatChange={onActiveFormatChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /format scope/i }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /active format/i }),
      'frame_reel'
    );

    expect(onActiveFormatChange).toHaveBeenCalledWith('frame_reel');
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
    render(
      <PromptComposer
        formatCount={4}
        formats={FORMATS}
        activeFormatId="frame_story"
        onSubmit={onSubmit}
      />
    );

    const textarea = screen.getByRole('textbox');
    // Type the prompt, then fire Shift+Enter via keyDown so the modifier
    // lands on the submit event. Using userEvent.keyboard so modifiers are
    // accurately modelled.
    await userEvent.type(textarea, 'bright editorial mood');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, opts] = onSubmit.mock.calls[0];
    expect(opts).toMatchObject({ scope: 'single', targetId: 'frame_story' });
  });

  it('onSubmit includes the selected format id when sticky single-format scope is active', async () => {
    const onSubmit = vi.fn();
    render(
      <PromptComposer
        formatCount={4}
        formats={FORMATS}
        activeFormatId="frame_reel"
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /format scope/i }));
    await userEvent.type(screen.getByRole('textbox'), 'poster crop{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[1]).toMatchObject({
      scope: 'single',
      targetId: 'frame_reel',
    });
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
