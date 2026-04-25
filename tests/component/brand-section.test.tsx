import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandSection } from '@/components/rail/sections/BrandSection';
import {
  BRAND_CONTEXT_STORAGE_KEY,
  resetBrandContextForTests,
} from '@/lib/context/brand-store';
import type { BrandSnapshot } from '@/lib/brand/types';

afterEach(() => {
  cleanup();
  resetBrandContextForTests();
});

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
    expect(screen.getByLabelText(/brand voice/i)).toHaveValue('Slow, certain skincare.');
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

  it('accepts bare domains in the creator-facing source field', async () => {
    const ingest = vi.fn(async () => ({ snapshot: HIGH_CONF_SNAPSHOT, review: false }));
    render(<BrandSection ingest={ingest} />);

    const input = screen.getByLabelText(/brand source/i);
    const submit = screen.getByRole('button', { name: /ingest/i });

    await userEvent.type(input, 'tong.berlayar.ai');
    expect(submit).not.toBeDisabled();
    await userEvent.click(submit);

    expect(ingest).toHaveBeenCalledWith({
      kind: 'url',
      source: 'https://tong.berlayar.ai',
    });
  });

  it('accepts bare github.com URLs as repo ingest', async () => {
    const ingest = vi.fn(async () => ({ snapshot: HIGH_CONF_SNAPSHOT, review: false }));
    render(<BrandSection ingest={ingest} />);

    await userEvent.type(
      screen.getByLabelText(/brand source/i),
      'github.com/solstice/solstice-launch-kit'
    );
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
    expect(screen.getByTestId('brand-review-banner')).toHaveTextContent(/review before saving/i);
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

  it('renders the baseline brand as an editable profile before ingest', () => {
    render(<BrandSection />);
    expect(screen.getByLabelText(/brand name/i)).toHaveValue('Solstice Skin');
    expect(screen.getAllByTestId('brand-palette-chip')).toHaveLength(5);
    expect(screen.getByLabelText(/brand voice/i)).toHaveValue(
      'slow, certain, more gesture than grammar.'
    );
  });

  it('saves edited brand fields to the client brand profile store', async () => {
    render(<BrandSection />);

    await userEvent.clear(screen.getByLabelText(/brand name/i));
    await userEvent.type(screen.getByLabelText(/brand name/i), 'Tong');
    fireEvent.change(screen.getByLabelText(/brand type/i), {
      target: { value: 'Noto Sans CJK\nInter' },
    });
    await userEvent.clear(screen.getByLabelText(/brand voice/i));
    await userEvent.type(screen.getByLabelText(/brand voice/i), 'Learn CJK by living in them.');
    await userEvent.clear(screen.getByLabelText(/hex colour 1/i));
    await userEvent.type(screen.getByLabelText(/hex colour 1/i), '#ef3340');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = JSON.parse(window.localStorage.getItem(BRAND_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(saved.name).toBe('Tong');
    expect(saved.type).toEqual(['Noto Sans CJK', 'Inter']);
    expect(saved.voice).toBe('Learn CJK by living in them.');
    expect(saved.palette[0]).toBe('#EF3340');
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
  });

  it('keeps hex input and the native colour picker in sync', async () => {
    render(<BrandSection />);

    fireEvent.change(screen.getByLabelText(/pick colour 1/i), {
      target: { value: '#123456' },
    });

    expect(screen.getByLabelText(/hex colour 1/i)).toHaveValue('#123456');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = JSON.parse(window.localStorage.getItem(BRAND_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(saved.palette[0]).toBe('#123456');
  });

  it('requires invalid hex colours to be fixed before saving', async () => {
    render(<BrandSection />);

    await userEvent.clear(screen.getByLabelText(/hex colour 1/i));
    await userEvent.type(screen.getByLabelText(/hex colour 1/i), 'nope');

    expect(screen.getByRole('alert')).toHaveTextContent(/invalid colour/i);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('accepts hex input with or without the leading hash', async () => {
    render(<BrandSection />);

    await userEvent.clear(screen.getByLabelText(/hex colour 1/i));
    await userEvent.type(screen.getByLabelText(/hex colour 1/i), 'ef3340');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = JSON.parse(window.localStorage.getItem(BRAND_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(saved.palette[0]).toBe('#EF3340');
  });
});
