import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AetherDeck,
  TitleSlideShell,
  SectionSlideShell,
} from '@/components/deck';
import type { AetherDeckSlide } from '@/components/deck';

const slides: AetherDeckSlide[] = [
  {
    id: 'one',
    title: 'Key visual',
    kind: 'title',
    children: <TitleSlideShell title="Key visual" subtitle="Fixed stage" />,
  },
  {
    id: 'two',
    title: 'Reference cluster',
    kind: 'section',
    children: (
      <SectionSlideShell title="Reference cluster">
        <button type="button">Inactive action</button>
      </SectionSlideShell>
    ),
  },
  {
    id: 'three',
    title: 'Export pack',
    kind: 'closing',
    children: <TitleSlideShell title="Export pack" />,
  },
];

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('AetherDeck fixed-stage primitives', () => {
  it('renders a 1920x1080 internal stage scaled uniformly into the viewport', () => {
    render(<AetherDeck slides={slides} fitBounds={{ width: 1000, height: 1000 }} />);

    const viewport = screen.getByRole('region', { name: /deck canvas/i }).querySelector(
      '[data-aether-deck-viewport="true"]'
    );
    const frame = screen.getByRole('region', { name: /deck canvas/i }).querySelector(
      '[data-aether-deck-frame="true"]'
    );
    const stage = screen.getByRole('region', { name: /deck canvas/i }).querySelector(
      '[data-aether-deck-stage="true"]'
    );

    expect(viewport).toHaveAttribute('data-stage-width', '1920');
    expect(viewport).toHaveAttribute('data-stage-height', '1080');
    expect(viewport).toHaveAttribute('data-stage-scale', '0.520833');
    expect(frame).toHaveStyle({ width: '1000px', height: '562.5px' });
    expect(stage).toHaveStyle({
      width: '1920px',
      height: '1080px',
      transform: 'scale(0.520833)',
    });
  });

  it('supports key, page, wheel, touch, and URL-addressable navigation', () => {
    window.history.replaceState({}, '', '/workspace?slide=2');
    const onSlideChange = vi.fn();
    render(
      <AetherDeck
        slides={slides}
        fitBounds={{ width: 960, height: 540 }}
        onSlideChange={onSlideChange}
      />
    );

    const deck = screen.getByRole('region', { name: /deck canvas/i });
    expect(deck).toHaveAttribute('data-slide-index', '1');
    expect(screen.getByRole('group', { name: /reference cluster/i })).toHaveAttribute(
      'data-active',
      'true'
    );

    fireEvent.keyDown(deck, { key: 'ArrowRight' });
    expect(deck).toHaveAttribute('data-slide-index', '2');
    expect(window.location.search).toBe('?slide=3');

    fireEvent.keyDown(deck, { key: 'PageUp' });
    expect(deck).toHaveAttribute('data-slide-index', '1');

    fireEvent.keyDown(deck, { key: ' ' });
    expect(deck).toHaveAttribute('data-slide-index', '2');

    fireEvent.wheel(deck, { deltaY: -120 });
    expect(deck).toHaveAttribute('data-slide-index', '1');

    fireEvent.touchStart(deck, {
      touches: [{ clientX: 500, clientY: 120 }],
    });
    fireEvent.touchEnd(deck, {
      changedTouches: [{ clientX: 260, clientY: 128 }],
    });
    expect(deck).toHaveAttribute('data-slide-index', '2');

    expect(onSlideChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        slideIndex: 2,
        fragmentIndex: 0,
        slideId: 'three',
      })
    );
  });

  it('keeps inactive slides mounted but hidden and non-interactive without display toggles', async () => {
    render(<AetherDeck slides={slides} fitBounds={{ width: 960, height: 540 }} />);

    const inactiveSlide = document.querySelector('[data-slide-id="two"]') as HTMLElement | null;
    expect(inactiveSlide).not.toBeNull();
    const inactiveSlideElement = inactiveSlide as HTMLElement;
    expect(inactiveSlideElement).toHaveAttribute('aria-hidden', 'true');
    expect(inactiveSlideElement).toHaveStyle({
      opacity: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    expect(inactiveSlideElement.style.display).toBe('');
    expect(screen.queryByRole('button', { name: /inactive action/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next slide/i }));
    expect(screen.getByRole('button', { name: /inactive action/i })).toBeInTheDocument();
  });

  it('marks reduced-motion mode and removes nonessential slide transition duration', () => {
    render(
      <AetherDeck
        slides={slides}
        fitBounds={{ width: 960, height: 540 }}
        reducedMotion
      />
    );

    const deck = screen.getByRole('region', { name: /deck canvas/i });
    const activeSlide = screen.getByRole('group', { name: /key visual/i });

    expect(deck).toHaveAttribute('data-reduced-motion', 'true');
    expect(activeSlide).toHaveStyle({ transitionDuration: '0ms' });
  });
});
