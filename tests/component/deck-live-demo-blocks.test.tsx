import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveApiCallBlock, ProductFrameBlock } from '@/components/deck/DeckBlocks';
import { PAILLETTE_SHARE_DECK } from '@/lib/deck/fixtures/paillette';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const productSearch = PAILLETTE_SHARE_DECK.slides
  .flatMap((slide) => slide.blocks)
  .find((block) => block.id === 'api-product-search')!;

const accountUsage = PAILLETTE_SHARE_DECK.slides
  .flatMap((slide) => slide.blocks)
  .find((block) => block.id === 'api-usage-call')!;

describe('creator-facing deck live demo blocks', () => {
  it('starts idle, shows running state, and renders a successful response', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    render(<LiveApiCallBlock block={productSearch} deck={PAILLETTE_SHARE_DECK} />);
    expect(screen.getByText(/ready to run/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'run' }));
    expect(screen.getByRole('button', { name: /running/i })).toBeDisabled();
    resolveResponse?.(new Response(JSON.stringify({ results: [{ id: 'one' }] }), { status: 200 }));
    await waitFor(() => expect(screen.getAllByText('1 results')).toHaveLength(2));
  });

  it('renders an allowed endpoint error without exposing debug details by default', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"temporarily busy"}', { status: 503 })));
    render(<LiveApiCallBlock block={productSearch} deck={PAILLETTE_SHARE_DECK} />);
    await userEvent.click(screen.getByRole('button', { name: 'run' }));
    await waitFor(() => expect(screen.getByText('temporarily busy')).toBeInTheDocument());
    expect(screen.getByText('raw JSON').closest('details')).not.toHaveAttribute('open');
  });

  it('shows signed-in and presenter-provided auth gates before execution', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<LiveApiCallBlock block={accountUsage} deck={PAILLETTE_SHARE_DECK} />);
    await userEvent.click(screen.getByRole('button', { name: 'run' }));
    expect(await screen.findByText(/please sign in/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Demo auth mode'), { target: { value: 'presenter-provided' } });
    await userEvent.click(screen.getByRole('button', { name: 'run' }));
    expect(await screen.findByText(/presenter credential is required/i)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('embeds only same-origin product routes and keeps a new-tab fallback', () => {
    const { rerender } = render(<ProductFrameBlock block={{ id: 'same', kind: 'product-frame', productUrl: '/search', title: 'Local product' }} />);
    expect(screen.getByTitle('Local product')).toHaveAttribute('src', '/search');
    rerender(<ProductFrameBlock block={{ id: 'external', kind: 'product-frame', productUrl: 'https://example.test/search', title: 'External product' }} />);
    expect(screen.queryByTitle('External product')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('target', '_blank');
  });
});
