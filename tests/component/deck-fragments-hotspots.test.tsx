import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckPresentation } from '@/components/deck/DeckPresentation';
import { DeckLens } from '@/components/deck/DeckLens';
import { PAILLETTE_SHARE_DECK } from '@/lib/deck/fixtures/paillette';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

function activeSlideId(container: HTMLElement) {
  return container.querySelector('[data-active="true"][data-slide-id]')?.getAttribute('data-slide-id');
}

describe('deck fragments', () => {
  it('steps through fragments in order before advancing, without display toggling', () => {
    window.history.replaceState({}, '', '/?slide=performance');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const slide = container.querySelector('[data-slide-id="ready-next"]') as HTMLElement;
    expect(slide).toHaveAttribute('data-active', 'true');
    expect(slide).toHaveAttribute('data-fragments-revealed', '0');
    expect(slide).toHaveAttribute('data-fragments-total', '2');

    const ready = slide.querySelector('[data-block-id="ready-copy"]') as HTMLElement;
    const next = slide.querySelector('[data-block-id="next-copy"]') as HTMLElement;
    expect(ready).toHaveStyle({ opacity: '0', pointerEvents: 'none' });
    expect(next).toHaveStyle({ opacity: '0', pointerEvents: 'none' });
    expect(ready.style.display).toBe('');
    expect(next.style.display).toBe('');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(slide).toHaveAttribute('data-fragments-revealed', '1');
    expect(ready).toHaveStyle({ opacity: '1' });
    expect(next).toHaveStyle({ opacity: '0', pointerEvents: 'none' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(slide).toHaveAttribute('data-fragments-revealed', '2');
    expect(next).toHaveStyle({ opacity: '1' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(activeSlideId(container)).toBe('closing');
    expect(window.location.search).toContain('slide=closing');
  });

  it('hides the last revealed fragment before moving to the previous slide', () => {
    window.history.replaceState({}, '', '/?slide=closing');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    const slide = container.querySelector('[data-slide-id="ready-next"]') as HTMLElement;
    expect(slide).toHaveAttribute('data-active', 'true');
    expect(slide).toHaveAttribute('data-fragments-revealed', '2');

    const next = slide.querySelector('[data-block-id="next-copy"]') as HTMLElement;
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(slide).toHaveAttribute('data-fragments-revealed', '1');
    expect(next).toHaveStyle({ opacity: '0', pointerEvents: 'none' });
    expect(next.style.display).toBe('');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(slide).toHaveAttribute('data-fragments-revealed', '0');
    expect(slide).toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(activeSlideId(container)).toBe('performance');
    expect(window.location.search).toContain('slide=performance');
  });

  it('shows a deep-linked slide fully revealed and keeps URL sync', () => {
    window.history.replaceState({}, '', '/?slide=ready-next');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const slide = container.querySelector('[data-slide-id="ready-next"]') as HTMLElement;
    expect(slide).toHaveAttribute('data-fragments-revealed', '2');
    expect(slide.querySelector('[data-block-id="ready-copy"]')).toHaveStyle({ opacity: '1' });
    expect(slide.querySelector('[data-block-id="next-copy"]')).toHaveStyle({ opacity: '1' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(activeSlideId(container)).toBe('closing');
    expect(window.location.search).toContain('slide=closing');
  });
});

describe('deck hotspots', () => {
  it('navigates to a hotspot target slide on click', async () => {
    window.history.replaceState({}, '', '/?slide=product-search');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go to Editorial variant' }));
    expect(activeSlideId(container)).toBe('product-search-editorial');
    expect(window.location.search).toContain('slide=product-search-editorial');
  });

  it('activates hotspots from the keyboard with Enter', async () => {
    window.history.replaceState({}, '', '/?slide=product-search');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const hotspot = screen.getByRole('button', { name: 'Go to Text API' });
    hotspot.focus();
    expect(hotspot).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(activeSlideId(container)).toBe('text-search-api');
  });

  it('switches live-demo focus when a hotspot targets a block on the same slide', async () => {
    window.history.replaceState({}, '', '/workspace/demo-ws?view=deck&slide=product-search');
    const { container } = render(<DeckLens />);
    const slide = container.querySelector('[data-slide-id="product-search"]') as HTMLElement;
    expect(slide.querySelector('[data-block-id="product-frame-search"]')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to API' }));
    expect(slide).toHaveAttribute('data-active', 'true');
    expect(slide.querySelector('[data-block-id="api-product-search"]')).toBeInTheDocument();
    expect(slide.querySelector('[data-block-id="product-frame-search"]')).not.toBeInTheDocument();
  });

  it('renders hotspot regions only on slides that define them', () => {
    window.history.replaceState({}, '', '/?slide=architecture');
    render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    expect(screen.queryByRole('button', { name: /^Go to / })).not.toBeInTheDocument();
  });
});

describe('deck branch jumps', () => {
  it('jumps to branch targets from mono-text chips in slide chrome', async () => {
    window.history.replaceState({}, '', '/?slide=hybrid-retrieval');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const chips = screen.getByTestId('deck-branch-jumps');
    expect(within(chips).getByRole('button', { name: /text-search-api/i })).toBeInTheDocument();
    await userEvent.click(within(chips).getByRole('button', { name: /image-search-api/i }));
    expect(activeSlideId(container)).toBe('image-search-api');
    expect(window.location.search).toContain('slide=image-search-api');
  });

  it('does not render branch chrome on slides without branch targets', () => {
    window.history.replaceState({}, '', '/?slide=architecture');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const slide = container.querySelector('[data-slide-id="architecture"]') as HTMLElement;
    expect(within(slide).queryByTestId('deck-branch-jumps')).not.toBeInTheDocument();
  });
});

describe('deck choreography', () => {
  it('transitions slides with restrained transform and opacity easing', () => {
    window.history.replaceState({}, '', '/?slide=solution');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const active = container.querySelector('[data-slide-id="solution"]') as HTMLElement;
    expect(active.style.transition).toContain('transform');
    expect(active.style.transition).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(active.style.transform).toBe('none');

    const before = container.querySelector('[data-slide-id="problem"]') as HTMLElement;
    const after = container.querySelector('[data-slide-id="architecture"]') as HTMLElement;
    expect(before.style.transform).toContain('translateX(-');
    expect(before.style.transform).toContain('scale(');
    expect(after.style.transform).toContain('translateX(');
    expect(after.style.transform).not.toContain('translateX(-');
  });

  it('staggers block entrances copy-first on the active slide', () => {
    window.history.replaceState({}, '', '/?slide=performance');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    const slide = container.querySelector('[data-slide-id="performance"]') as HTMLElement;
    const copy = slide.querySelector('[data-block-id="performance-copy"]') as HTMLElement;
    const metrics = slide.querySelector('[data-block-id="performance-metrics"]') as HTMLElement;
    expect(copy.style.transition).toContain('100ms');
    expect(metrics.style.transition).toContain('260ms');
    expect(copy.style.transition).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('disables all transitions under reduced motion while fragments still reveal instantly', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    window.history.replaceState({}, '', '/?slide=performance');
    const { container } = render(<DeckPresentation deck={PAILLETTE_SHARE_DECK} presenterMode={false} />);
    expect(screen.getByTestId('deck-viewport')).toHaveAttribute('data-reduced-motion', 'true');

    const performance = container.querySelector('[data-slide-id="performance"]') as HTMLElement;
    expect(performance.style.transition).toBe('none');
    const copy = performance.querySelector('[data-block-id="performance-copy"]') as HTMLElement;
    expect(copy.style.transition).toBe('none');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const readyNext = container.querySelector('[data-slide-id="ready-next"]') as HTMLElement;
    expect(readyNext).toHaveAttribute('data-active', 'true');
    expect(readyNext.style.transition).toBe('none');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(readyNext).toHaveAttribute('data-fragments-revealed', '1');
    const ready = readyNext.querySelector('[data-block-id="ready-copy"]') as HTMLElement;
    expect(ready).toHaveStyle({ opacity: '1' });
    expect(ready.style.transition).toBe('none');
  });
});
