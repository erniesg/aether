import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferSection } from '@/components/rail/sections/OfferSection';
import { CampaignSection } from '@/components/rail/sections/CampaignSection';
import {
  CAMPAIGN_CONTEXT_STORAGE_KEY,
  OFFER_CONTEXT_STORAGE_KEY,
  resetCreatorContextForTests,
} from '@/lib/context/creator-store';
import {
  resetProposalsForTests,
  setProposedCampaigns,
  setProposedOffers,
} from '@/lib/proposals/store';

beforeEach(() => {
  window.localStorage.clear();
  resetCreatorContextForTests();
  resetProposalsForTests();
});

afterEach(() => {
  cleanup();
  resetCreatorContextForTests();
  resetProposalsForTests();
});

describe('OfferSection · proposed offer cards', () => {
  it('renders AI-suggested cards from the proposals store', () => {
    setProposedOffers([
      {
        id: 'offer-spring-reset',
        name: 'Spring Reset Duo',
        summary: 'barrier repair + glow',
        claims: ['ceramide', 'niacinamide'],
        heroAsset: 'amber bottle pair',
      },
    ]);

    render(<OfferSection />);

    expect(screen.getByTestId('proposed-offer-offer-spring-reset')).toBeInTheDocument();
    expect(screen.getByTestId('ai-suggested-badge')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept proposed offer spring reset duo/i })
    ).toBeInTheDocument();
  });

  it('promotes a proposed offer into the offer profile when accepted', async () => {
    setProposedOffers([
      {
        id: 'offer-spring-reset',
        name: 'Spring Reset Duo',
        summary: 'barrier repair + glow',
        claims: ['ceramide cleanse'],
        heroAsset: 'amber bottle pair',
      },
    ]);

    render(<OfferSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /accept proposed offer spring reset duo/i })
    );

    await waitFor(() => {
      expect(screen.queryByTestId('proposed-offer-offer-spring-reset')).toBeNull();
    });

    const saved = JSON.parse(window.localStorage.getItem(OFFER_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(saved.name).toBe('Spring Reset Duo');
    expect(saved.summary).toBe('barrier repair + glow');
    expect(saved.claims).toEqual(['ceramide cleanse']);
    expect(screen.getByLabelText(/offer name/i)).toHaveValue('Spring Reset Duo');
  });

  it('removes a proposed offer when rejected without touching the offer profile', async () => {
    setProposedOffers([
      {
        id: 'offer-night-rep',
        name: 'Night Repair',
        summary: 'overnight ceramide repair',
        claims: [],
        heroAsset: '',
      },
    ]);

    render(<OfferSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /reject proposed offer night repair/i })
    );

    await waitFor(() => {
      expect(screen.queryByTestId('proposed-offer-offer-night-rep')).toBeNull();
    });
    expect(window.localStorage.getItem(OFFER_CONTEXT_STORAGE_KEY)).toBeNull();
  });

  it('regenerate-from-brand button calls the propose seam with the brand snapshot', async () => {
    const regenerate = vi.fn(async () => ({
      offers: [
        {
          id: 'offer-fresh-1',
          name: 'Regenerated Reset',
          summary: 'second-pass barrier repair',
          claims: ['barrier'],
          heroAsset: '',
        },
      ],
      campaigns: [],
      coverage: { ok: true, notes: [] },
    }));

    render(<OfferSection regenerate={regenerate} />);

    await userEvent.click(
      screen.getByRole('button', { name: /regenerate offers from brand/i })
    );

    await waitFor(() => {
      expect(regenerate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('proposed-offer-offer-fresh-1')).toBeInTheDocument();
    });
  });

  it('surfaces an error banner when regenerate fails', async () => {
    const regenerate = vi.fn(async () => {
      throw new Error('Anthropic API error');
    });

    render(<OfferSection regenerate={regenerate} />);

    await userEvent.click(
      screen.getByRole('button', { name: /regenerate offers from brand/i })
    );

    await waitFor(() => {
      expect(screen.getByTestId('offer-regenerate-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('offer-regenerate-error')).toHaveTextContent(/regenerate failed/i);
  });
});

describe('CampaignSection · proposed campaign cards', () => {
  it('renders AI-suggested cards from the proposals store', () => {
    setProposedCampaigns([
      {
        id: 'campaign-slow-morning',
        name: 'Slow Morning Drop',
        goal: 'launch spring line',
        audience: 'IG skincare shoppers',
        channels: ['IG post', 'story'],
        cta: 'shop the drop',
      },
    ]);

    render(<CampaignSection />);

    expect(screen.getByTestId('proposed-campaign-campaign-slow-morning')).toBeInTheDocument();
    expect(screen.getByTestId('ai-suggested-badge')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept proposed campaign slow morning drop/i })
    ).toBeInTheDocument();
  });

  it('promotes a proposed campaign into the campaign profile when accepted', async () => {
    setProposedCampaigns([
      {
        id: 'campaign-slow-morning',
        name: 'Slow Morning Drop',
        goal: 'launch spring line',
        audience: 'IG skincare shoppers',
        channels: ['IG post'],
        cta: 'shop the drop',
      },
    ]);

    render(<CampaignSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /accept proposed campaign slow morning drop/i })
    );

    await waitFor(() => {
      expect(screen.queryByTestId('proposed-campaign-campaign-slow-morning')).toBeNull();
    });

    const saved = JSON.parse(window.localStorage.getItem(CAMPAIGN_CONTEXT_STORAGE_KEY) ?? '{}');
    expect(saved.name).toBe('Slow Morning Drop');
    expect(saved.goal).toBe('launch spring line');
    expect(saved.cta).toBe('shop the drop');
    expect(screen.getByLabelText(/campaign name/i)).toHaveValue('Slow Morning Drop');
  });

  it('removes a proposed campaign when rejected without touching the campaign profile', async () => {
    setProposedCampaigns([
      {
        id: 'campaign-fall-edit',
        name: 'Fall Edit',
        goal: 'transition skincare',
        audience: '',
        channels: [],
        cta: 'shop',
      },
    ]);

    render(<CampaignSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /reject proposed campaign fall edit/i })
    );

    await waitFor(() => {
      expect(screen.queryByTestId('proposed-campaign-campaign-fall-edit')).toBeNull();
    });
    expect(window.localStorage.getItem(CAMPAIGN_CONTEXT_STORAGE_KEY)).toBeNull();
  });

  it('regenerate-from-brand button populates fresh campaign cards', async () => {
    const regenerate = vi.fn(async () => ({
      offers: [],
      campaigns: [
        {
          id: 'campaign-fresh-1',
          name: 'Regenerated Drop',
          goal: 'second-pass launch',
          audience: '',
          channels: ['pin'],
          cta: 'shop now',
        },
      ],
      coverage: { ok: true, notes: [] },
    }));

    render(<CampaignSection regenerate={regenerate} />);

    await userEvent.click(
      screen.getByRole('button', { name: /regenerate campaigns from brand/i })
    );

    await waitFor(() => {
      expect(regenerate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('proposed-campaign-campaign-fresh-1')).toBeInTheDocument();
    });
  });
});
