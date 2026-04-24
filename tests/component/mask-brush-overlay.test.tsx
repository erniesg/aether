import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MaskBrushOverlay } from '@/components/canvas/MaskBrushOverlay';

afterEach(cleanup);

const baseProps = {
  rect: { x: 40, y: 60, w: 480, h: 600 },
  imageSize: { width: 1080, height: 1350 },
  onCancel: () => {},
  onApply: () => {},
};

describe('MaskBrushOverlay', () => {
  it('renders the mask surface, prompt input, and controls', () => {
    render(<MaskBrushOverlay {...baseProps} />);
    expect(screen.getByRole('dialog', { name: /mask brush editor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/edit prompt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply edit/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel mask edit/i })).toBeEnabled();
  });

  it('blocks apply until both a prompt and at least one stroke exist', async () => {
    const onApply = vi.fn();
    render(<MaskBrushOverlay {...baseProps} onApply={onApply} />);
    const prompt = screen.getByLabelText(/edit prompt/i);
    await userEvent.type(prompt, 'replace shirt colour');

    // Still no strokes → apply disabled and never called
    const apply = screen.getByRole('button', { name: /apply edit/i });
    expect(apply).toBeDisabled();
    await userEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('routes cancel clicks through onCancel', async () => {
    const onCancel = vi.fn();
    render(<MaskBrushOverlay {...baseProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel mask edit/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays an error alert when errorMessage is provided', () => {
    render(<MaskBrushOverlay {...baseProps} errorMessage="edit failed · retry" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/edit failed/);
  });

  it('disables interactive controls while busy', () => {
    render(<MaskBrushOverlay {...baseProps} busy errorMessage={null} />);
    expect(screen.getByRole('button', { name: /cancel mask edit/i })).toBeDisabled();
    expect(screen.getByLabelText(/edit prompt/i)).toBeDisabled();
  });
});
