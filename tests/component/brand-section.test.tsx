import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandSection } from '@/components/rail/sections/BrandSection';
import type { BrandSnapshot } from '@/lib/brand/types';

afterEach(cleanup);

const HIGH_CONF_SNAPSHOT: BrandSnapshot = {
  palette: [
    { hex: '#0f1013', role: 'primary' },
    { hex: '#e8e4d6', role: 'accent' },
    { hex: '#c48b5e', role: 'neutral' },
  ],
  typography: [
    { family: 'Canela Deck', role: 'display' },
    { family: 'Inter', role: 'body' },
  ],
  voice: { samples: ['Slow, certain skincare.'] },
  logos: [],
  productImages: [],
  confidence: 0.72,
  source: { kind: 'url', url: 'https://solsticeskin.com' },
};

const LOW_CONF_SNAPSHOT: BrandSnapshot = {
  palette: [{ hex: '#0f1013' }],
  typography: [],
  voice: { samples: [] },
  logos: [],
  productImages: [],
  confidence: 0.32,
  source: { kind: 'files' },
};

describe('BrandSection · drop zone', () => {
  it('renders a drop zone that accepts a URL and renders palette + voice on success', async () => {
    const ingest = vi.fn(async () => ({ snapshot: HIGH_CONF_SNAPSHOT, review: false }));
    render(<BrandSection ingest={ingest} />);

    const input = screen.getByLabelText(/brand source/i);
    const submit = screen.getByRole('button', { name: /ingest/i });
    expect(submit).toBeDisabled();

    await userEvent.type(input, 'https://solsticeskin.com');
    expect(submit).not.toBeDisabled();
    await userEvent.click(submit);

    expect(ingest).toHaveBeenCalledWith({
      kind: 'url',
      source: 'https://solsticeskin.com',
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('brand-palette-chip')).toHaveLength(3);
    });
    expect(screen.getByText('“Slow, certain skincare.”')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-review-banner')).toBeNull();
  });

  it('routes a github.com URL as a repo ingest', async () => {
    const ingest = vi.fn(async () => ({ snapshot: HIGH_CONF_SNAPSHOT, review: false }));
    render(<BrandSection ingest={ingest} />);

    const input = screen.getByLabelText(/brand source/i);
    await userEvent.type(input, 'https://github.com/solstice/solstice-launch-kit');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    expect(ingest).toHaveBeenCalledWith({
      kind: 'repo',
      source: 'https://github.com/solstice/solstice-launch-kit',
    });
  });

  it('surfaces a review banner when the ingest returns review=true', async () => {
    const ingest = vi.fn(async () => ({ snapshot: LOW_CONF_SNAPSHOT, review: true }));
    render(<BrandSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/brand source/i), 'https://thin.example.com');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByTestId('brand-review-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('brand-review-banner')).toHaveTextContent(/review before applying/i);
  });

  it('surfaces an error when the ingest rejects', async () => {
    const ingest = vi.fn(async () => {
      throw new Error('fetch failed: 500 Server Error');
    });
    render(<BrandSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/brand source/i), 'https://broken.example.com');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not read source/i);
    });
  });

  it('keeps the baseline brand body until an ingest lands (restraint rule)', () => {
    render(<BrandSection />);
    // Baseline brand copy from DEMO_CREATOR_CONTEXT should still render.
    expect(screen.getByText(/brand site/i)).toBeInTheDocument();
    expect(screen.queryByTestId('brand-palette-chip')).toBeNull();
  });
});
