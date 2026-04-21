import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from '@/components/ui/Chip';

describe('Chip primitive', () => {
  it('renders its children', () => {
    render(<Chip>active</Chip>);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('accepts every declared tone without runtime error', () => {
    const tones = ['neutral', 'accent', 'secondary', 'ok', 'warn', 'error', 'info'] as const;
    for (const tone of tones) {
      const { unmount } = render(<Chip tone={tone}>t-{tone}</Chip>);
      expect(screen.getByText(`t-${tone}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('supports icon + trailing slots', () => {
    render(
      <Chip icon={<span data-testid="lead">•</span>} trailing={<span data-testid="tail">x</span>}>
        label
      </Chip>
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('tail')).toBeInTheDocument();
  });
});
