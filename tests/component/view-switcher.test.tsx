import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewSwitcher, type ViewId } from '@/components/header/ViewSwitcher';

afterEach(cleanup);

describe('ViewSwitcher', () => {
  it('renders seven pills in canvas/focus/timeline/deck/graph/mood/chat order', () => {
    render(<ViewSwitcher view="canvas" onChangeView={() => {}} />);

    const toolbar = screen.getByRole('tablist', { name: /workspace view/i });
    expect(toolbar).toHaveAttribute('data-taxonomy', 'navigation');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    // Each pill begins with its label; disabled pills append a "soon" affordance.
    const leadWords = tabs.map(
      (t) => (t.textContent ?? '').toLowerCase().match(/^[a-z]+/)?.[0]
    );
    expect(leadWords).toEqual(['canvas', 'focus', 'timeline', 'deck', 'graph', 'mood', 'chat']);
  });

  it('marks canvas, focus, timeline, and deck as interactive and the remaining three as disabled (soon)', () => {
    render(<ViewSwitcher view="canvas" onChangeView={() => {}} />);

    const canvas = screen.getByRole('tab', { name: /^canvas/i });
    const focus = screen.getByRole('tab', { name: /^focus/i });
    const timeline = screen.getByRole('tab', { name: /^timeline/i });
    const deck = screen.getByRole('tab', { name: /^deck/i });
    expect(canvas).not.toBeDisabled();
    expect(focus).not.toBeDisabled();
    expect(timeline).not.toBeDisabled();
    expect(deck).not.toBeDisabled();

    for (const name of ['graph', 'mood', 'chat'] as const) {
      const tab = screen.getByRole('tab', { name: new RegExp(`^${name}`, 'i') });
      expect(tab).toBeDisabled();
      expect(tab.textContent?.toLowerCase()).toContain('soon');
    }
  });

  it('applies aria-current to the active view', () => {
    const { rerender } = render(<ViewSwitcher view="canvas" onChangeView={() => {}} />);
    expect(screen.getByRole('tab', { name: /^canvas/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('tab', { name: /^focus/i })).not.toHaveAttribute('aria-current');

    rerender(<ViewSwitcher view="focus" onChangeView={() => {}} />);
    expect(screen.getByRole('tab', { name: /^focus/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('tab', { name: /^canvas/i })).not.toHaveAttribute('aria-current');
  });

  it('calls onChangeView when the creator clicks an enabled pill', async () => {
    const onChangeView = vi.fn<(next: ViewId) => void>();
    render(<ViewSwitcher view="canvas" onChangeView={onChangeView} />);

    await userEvent.click(screen.getByRole('tab', { name: /^focus/i }));
    expect(onChangeView).toHaveBeenCalledWith('focus');

    await userEvent.click(screen.getByRole('tab', { name: /^timeline/i }));
    expect(onChangeView).toHaveBeenCalledWith('timeline');

    await userEvent.click(screen.getByRole('tab', { name: /^deck/i }));
    expect(onChangeView).toHaveBeenCalledWith('deck');
  });

  it('does NOT call onChangeView when the creator clicks a disabled pill', async () => {
    const onChangeView = vi.fn<(next: ViewId) => void>();
    render(<ViewSwitcher view="canvas" onChangeView={onChangeView} />);

    await userEvent.click(screen.getByRole('tab', { name: /^graph/i }));
    expect(onChangeView).not.toHaveBeenCalled();
  });
});
