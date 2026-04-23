import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FloatingToolbar } from '@/components/canvas/FloatingToolbar';

afterEach(cleanup);

describe('FloatingToolbar · voice slot', () => {
  it('renders the voice slot only when provided (taxonomy stays `tool`)', () => {
    const { rerender } = render(<FloatingToolbar />);
    expect(screen.queryByTestId('voice-slot-chip')).not.toBeInTheDocument();

    rerender(
      <FloatingToolbar
        voiceSlot={
          <button type="button" data-testid="voice-slot-chip" aria-label="voice · idle">
            mic
          </button>
        }
      />
    );

    const chip = screen.getByTestId('voice-slot-chip');
    expect(chip).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar', { name: /canvas tools/i });
    expect(toolbar).toHaveAttribute('data-taxonomy', 'tool');
    expect(toolbar).toContainElement(chip);
  });
});
