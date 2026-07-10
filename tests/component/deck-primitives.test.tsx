import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckPresentation, DeckStage } from '@/components/deck/DeckPresentation';
import { PAILLETTE_SHARE_DECK } from '@/lib/deck/fixtures/paillette';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('deck primitives', () => {
  it('uniformly scales a fixed 1920x1080 stage', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 960,
      height: 700,
      top: 0,
      left: 0,
      right: 960,
      bottom: 700,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    render(<DeckStage><div>fixed slide</div></DeckStage>);
    fireEvent(window, new Event('resize'));
    expect(screen.getByTestId('deck-stage')).toHaveStyle({ width: '1920px', height: '1080px', transform: 'translate(-50%, -50%) scale(0.5)' });
  });

  it('navigates with keys, wheel, touch, and URL-addressable state', () => {
    window.history.replaceState({}, '', '/workspace/demo?slide=solution');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} />);
    expect(container.querySelector('[data-slide-id="solution"]')).toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(container.querySelector('[data-slide-id="architecture"]')).toHaveAttribute('data-active', 'true');
    fireEvent.wheel(screen.getByTestId('deck-viewport'), { deltaY: 40 });
    expect(container.querySelector('[data-slide-id="product-search"]')).toHaveAttribute('data-active', 'true');
    fireEvent.touchStart(screen.getByTestId('deck-viewport'), { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(screen.getByTestId('deck-viewport'), { changedTouches: [{ clientX: 80 }] });
    expect(container.querySelector('[data-slide-id="text-search-api"]')).toHaveAttribute('data-active', 'true');
    expect(window.location.search).toContain('slide=text-search-api');
  });

  it('makes inactive slides noninteractive without display toggling', () => {
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} />);
    const inactive = container.querySelector('[data-slide-id="solution"]') as HTMLElement;
    expect(inactive).toHaveStyle({ opacity: '0', visibility: 'hidden', pointerEvents: 'none' });
    expect(inactive.style.display).toBe('');
  });

  it('marks reduced motion and exposes presenter metadata', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} />);
    expect(screen.getByTestId('deck-viewport')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.getByTestId('deck-presenter-notes')).toBeInTheDocument();
  });
});
