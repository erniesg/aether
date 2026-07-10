import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DeckLens } from '@/components/deck/DeckLens';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('deck live-demo composition', () => {
  it('keeps one Product/API/Code proof surface visible at a time', async () => {
    window.history.replaceState({}, '', '/workspace/demo-ws?view=deck&slide=product-search');
    const { container } = render(<DeckLens />);
    const activeSlide = container.querySelector('[data-slide-id="product-search"]') as HTMLElement;

    expect(activeSlide.querySelector('[data-block-id="product-frame-search"]')).toBeInTheDocument();
    expect(activeSlide.querySelector('[data-block-id="api-product-search"]')).not.toBeInTheDocument();
    expect(activeSlide.querySelector('[data-block-id="code-product-search"]')).not.toBeInTheDocument();
    expect(within(activeSlide).getByText('Zhong Zheng Ren (中正人)')).toBeInTheDocument();
    expect(within(activeSlide).getByText('2019-00754')).toBeInTheDocument();
    const artwork = within(activeSlide).getByRole('img', { name: /zhong zheng ren/i });
    expect(artwork).toHaveClass('bg-contain', 'bg-center', 'bg-no-repeat');
    expect(artwork).not.toHaveClass('bg-cover');

    await userEvent.click(screen.getByRole('button', { name: 'API' }));
    expect(activeSlide.querySelector('[data-block-id="product-frame-search"]')).not.toBeInTheDocument();
    expect(activeSlide.querySelector('[data-block-id="api-product-search"]')).toBeInTheDocument();
    expect(activeSlide.querySelector('[data-block-id="code-product-search"]')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(activeSlide.querySelector('[data-block-id="api-product-search"]')).not.toBeInTheDocument();
    expect(activeSlide.querySelector('[data-block-id="code-product-search"]')).toBeInTheDocument();
  });

  it('uses the Neo-Grid fixed-stage composition and in-stage navigation', () => {
    window.history.replaceState({}, '', '/workspace/demo-ws?view=deck&slide=product-search');
    const { container } = render(<DeckLens />);
    const activeSlide = container.querySelector('[data-slide-id="product-search"]') as HTMLElement;
    expect(activeSlide).toHaveAttribute('data-style', 'neo-grid-bold');
    expect(within(activeSlide).getByTestId('neo-grid-frame')).toHaveClass(
      'inset-[40px]',
      'grid-cols-12',
      'grid-rows-8',
      'gap-3'
    );
    expect(within(activeSlide).getByTestId('live-demo-title')).toHaveClass(
      'text-[88px]',
      'uppercase'
    );
    expect(screen.getByTestId('live-demo-focus-nav')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Product' })).toHaveClass('bg-[#D946EF]');
    expect(screen.getByTestId('deck-navigation')).toHaveClass('py-1');
  });
});
