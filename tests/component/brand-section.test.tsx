import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandSection } from '@/components/rail/sections/BrandSection';
import {
  BRAND_CONTEXT_STORAGE_KEY,
  CAMPAIGN_CONTEXT_STORAGE_KEY,
  OFFER_CONTEXT_STORAGE_KEY,
  resetBrandContextForTests,
  resetCreatorContextForTests,
} from '@/lib/context/creator-store';
import { resetSignalsForTests } from '@/lib/signals/store';
import type { BrandFollowups } from '@/lib/brand/propose';
import type { BrandSnapshot } from '@/lib/brand/types';

function resetTestState() {
  cleanup();
  window.localStorage.clear();
  resetBrandContextForTests();
  resetCreatorContextForTests();
  resetSignalsForTests();
}

beforeEach(resetTestState);
afterEach(() => {
  resetTestState();
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

const BROMPTON_SNAPSHOT: BrandSnapshot = {
  palette: [{ hex: '#111111', role: 'primary' }],
  typography: [
    { family: 'Raleway', role: 'display' },
    { family: 'Roboto', role: 'body' },
  ],
  voice: { samples: ['G Line goes beyond the city.'] },
  logos: [],
  productImages: [],
  confidence: 0.72,
  source: { kind: 'url', url: 'https://sg.brompton.com/c/bikes/g-line' },
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

  it('reruns brand proposals from the prefilled profile and tracks proposed signals', async () => {
    const propose = vi.fn(async () => ({
      offers: [],
      campaigns: [],
      signals: [
        {
          id: 'signal-golden-hour-skincare-01',
          kind: 'keyword' as const,
          value: 'golden hour skincare',
          reason: 'brand mood',
        },
      ],
      coverage: { ok: true, notes: [] },
    }));
    render(<BrandSection propose={propose} />);

    await userEvent.click(screen.getByTestId('brand-rerun-proposals'));
    await waitFor(() => {
      expect(screen.getByLabelText('signal draft signal-golden-hour-skincare-01')).toHaveValue('golden hour skincare');
    });
    await userEvent.click(
      screen.getByRole('button', { name: /^track signal golden hour skincare$/i })
    );

    const saved = JSON.parse(window.localStorage.getItem('aether.signals.v1') ?? '[]');
    expect(saved[0]).toMatchObject({ kind: 'keyword', value: 'golden hour skincare' });
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ kind: expect.any(String) }),
      })
    );
  });

  it('renders editable offer and campaign drafts after ingest and applies them explicitly', async () => {
    const ingest = vi.fn(async () => ({ snapshot: BROMPTON_SNAPSHOT, review: false }));
    const propose = vi.fn(async () => ({
      offers: [
        {
          id: 'offer-brompton-g-line-01',
          name: 'G Line',
          summary: 'all-terrain folding bike for city-to-trail rides',
          claims: ['folding format', 'larger wheels'],
          heroAsset: 'G Line bike',
        },
      ],
      campaigns: [
        {
          id: 'campaign-brompton-anywhere-01',
          name: 'Anywhere Unfolds',
          goal: 'launch the G Line as the Brompton for mixed terrain weekends.',
          audience: 'urban riders looking beyond the commute',
          channels: ['IG post', 'reel cover', 'story'],
          cta: 'discover G Line',
        },
      ],
      signals: [],
      coverage: { ok: true, notes: [] },
    }));
    render(<BrandSection ingest={ingest} propose={propose} />);

    await userEvent.type(screen.getByLabelText(/brand source/i), 'https://sg.brompton.com/c/bikes/g-line');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('offer draft offer-brompton-g-line-01 name')).toHaveValue('G Line');
    });
    expect(screen.getByTestId('propose-offers-section')).toHaveTextContent(/offers/i);
    expect(screen.getByTestId('propose-campaigns-section')).toHaveTextContent(/campaigns/i);
    expect(window.localStorage.getItem(OFFER_CONTEXT_STORAGE_KEY)).toBeNull();

    await userEvent.clear(screen.getByLabelText('campaign draft campaign-brompton-anywhere-01 name'));
    await userEvent.type(
      screen.getByLabelText('campaign draft campaign-brompton-anywhere-01 name'),
      'G Line City Escape'
    );
    await userEvent.click(screen.getByRole('button', { name: /apply offer G Line/i }));
    await userEvent.click(screen.getByRole('button', { name: /apply campaign G Line City Escape/i }));

    const offer = JSON.parse(window.localStorage.getItem(OFFER_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(offer.name).toBe('G Line');
    const campaign = JSON.parse(window.localStorage.getItem(CAMPAIGN_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(campaign.name).toBe('G Line City Escape');
    expect(campaign.goal).toMatch(/G Line/);
    expect(screen.getByLabelText(/brand name/i)).toHaveValue('Brompton');
  });

  it('stores proposal history and reuses previous editable results', async () => {
    const ingest = vi.fn(async () => ({ snapshot: BROMPTON_SNAPSHOT, review: false }));
    const propose = vi.fn(async () => ({
      offers: [
        {
          id: 'offer-history-01',
          name: 'Reuse Offer',
          summary: 'saved proposal result',
          claims: ['saved'],
          heroAsset: 'archive',
        },
      ],
      campaigns: [
        {
          id: 'campaign-history-01',
          name: 'Reuse Campaign',
          goal: 'reuse this prior campaign',
          audience: 'returning creators',
          channels: ['IG post'],
          cta: 'reuse',
        },
      ],
      signals: [],
      coverage: { ok: true, notes: [] },
    }));
    render(<BrandSection ingest={ingest} propose={propose} />);

    await userEvent.type(screen.getByLabelText(/brand source/i), 'https://sg.brompton.com/c/bikes/g-line');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('offer draft offer-history-01 name')).toHaveValue('Reuse Offer');
    });
    await userEvent.click(screen.getByLabelText(/proposal history/i));
    expect(screen.getByTestId('proposal-history')).toHaveTextContent('sg.brompton.com');
    await userEvent.click(
      within(screen.getByTestId('proposal-history')).getByRole('button', { name: /^reuse$/i })
    );
    expect(screen.getByLabelText('campaign draft campaign-history-01 name')).toHaveValue('Reuse Campaign');
  });

  it('keeps proposal progress visible while the proposer is running', async () => {
    const propose = vi.fn(
      () =>
        new Promise<BrandFollowups>(() => {
          // keep pending
        })
    );
    render(<BrandSection propose={propose} />);

    await userEvent.click(screen.getByTestId('brand-rerun-proposals'));
    expect(screen.getByTestId('brand-run-progress')).toHaveTextContent(/proposing offers/i);
  });

  it('does not render the stale workspace label above the editable brand name', () => {
    render(<BrandSection workspaceLabel="Solstice Collective" />);
    expect(screen.queryByText('Solstice Collective')).toBeNull();
    expect(screen.getByLabelText(/brand name/i)).toHaveValue('Solstice Skin');
  });

  it('keeps the existing campaign context untouched until a draft is applied', async () => {
    const ingest = vi.fn(async () => ({ snapshot: BROMPTON_SNAPSHOT, review: false }));
    const propose = vi.fn(async () => ({
      offers: [],
      campaigns: [
        {
          id: 'campaign-no-auto-01',
          name: 'Not Auto Applied',
          goal: 'wait for explicit apply',
          audience: 'creators',
          channels: ['story'],
          cta: 'apply',
        },
      ],
      signals: [],
      coverage: { ok: true, notes: [] },
    }));
    render(<BrandSection ingest={ingest} propose={propose} />);

    await userEvent.type(screen.getByLabelText(/brand source/i), 'https://sg.brompton.com/c/bikes/g-line');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('campaign draft campaign-no-auto-01 name')).toHaveValue('Not Auto Applied');
    });
    const campaign = JSON.parse(window.localStorage.getItem(CAMPAIGN_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(campaign.name).not.toBe('Not Auto Applied');
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
    // Type rows are per-line inputs now: clear the first, set CJK; add a row
    // for Inter.
    const firstType = screen.getByLabelText('brand type 1');
    await userEvent.clear(firstType);
    await userEvent.type(firstType, 'Noto Sans CJK');
    await userEvent.click(screen.getByRole('button', { name: /^\+ type$/i }));
    const secondType = screen.getByLabelText('brand type 2');
    await userEvent.clear(secondType);
    await userEvent.type(secondType, 'Inter');
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
