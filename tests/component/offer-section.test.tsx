import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferSection } from '@/components/rail/sections/OfferSection';
import type { OfferIngestRequest, OfferSnapshot } from '@/lib/offer/types';

type IngestFn = (req: OfferIngestRequest) => Promise<{
  snapshot: OfferSnapshot;
  review: boolean;
}>;

afterEach(cleanup);

const HIGH_CONF_SNAPSHOT: OfferSnapshot = {
  name: 'Spring Reset Duo',
  tagline: 'Barrier repair plus golden-hour glow.',
  claims: ['Ceramide cleanse', 'Niacinamide glow', 'Fragrance-free'],
  priceTiers: [{ label: 'Solo', price: '$29', period: 'mo' }],
  launchWindow: { startAt: '2026-04-30' },
  proof: ['Changed my morning routine.'],
  heroImages: [{ url: 'https://cdn.example.com/duo.jpg', alt: 'amber duo' }],
  confidence: 0.72,
  source: { kind: 'url', url: 'https://solsticeskin.com/duo' },
};

const LOW_CONF_SNAPSHOT: OfferSnapshot = {
  name: 'Spring Reset Duo',
  claims: ['Ceramide cleanse'],
  heroImages: [],
  confidence: 0.3,
  source: { kind: 'files' },
};

describe('OfferSection · drop zone', () => {
  it('renders the drop zone and routes a URL as kind=url', async () => {
    const ingest: Mock<IngestFn> = vi.fn(async () => ({
      snapshot: HIGH_CONF_SNAPSHOT,
      review: false,
    }));
    render(<OfferSection ingest={ingest} />);

    const input = screen.getByLabelText(/offer source/i);
    const submit = screen.getByRole('button', { name: /ingest/i });
    expect(submit).toBeDisabled();

    await userEvent.type(input, 'https://solsticeskin.com/duo');
    expect(submit).not.toBeDisabled();
    await userEvent.click(submit);

    expect(ingest).toHaveBeenCalledWith({
      kind: 'url',
      source: 'https://solsticeskin.com/duo',
    });

    await waitFor(() => {
      expect(screen.getByText('Spring Reset Duo')).toBeInTheDocument();
    });
    expect(screen.getByTestId('offer-claims-list')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-review-banner')).toBeNull();
  });

  it('renders claims as editable chips after ingest', async () => {
    const ingest: Mock<IngestFn> = vi.fn(async () => ({
      snapshot: HIGH_CONF_SNAPSHOT,
      review: false,
    }));
    render(<OfferSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/offer source/i), 'https://solsticeskin.com/duo');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/claim 1/i)).toHaveValue('Ceramide cleanse');
    });
    expect(screen.getByLabelText(/claim 2/i)).toHaveValue('Niacinamide glow');
    expect(screen.getByLabelText(/claim 3/i)).toHaveValue('Fragrance-free');
    // Adding a claim via the add chip grows the list.
    await userEvent.type(screen.getByLabelText(/add claim/i), 'Cruelty-free{Enter}');
    await waitFor(() => {
      expect(screen.getByLabelText(/claim 4/i)).toHaveValue('Cruelty-free');
    });
  });

  it('removes a claim via the × button', async () => {
    const ingest: Mock<IngestFn> = vi.fn(async () => ({
      snapshot: HIGH_CONF_SNAPSHOT,
      review: false,
    }));
    render(<OfferSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/offer source/i), 'https://solsticeskin.com/duo');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));
    await waitFor(() => expect(screen.getByLabelText(/claim 1/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /remove claim 1/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/claim 1/i)).toHaveValue('Niacinamide glow');
    });
  });

  it('surfaces a review banner when the ingest returns review=true', async () => {
    const ingest = vi.fn(async () => ({ snapshot: LOW_CONF_SNAPSHOT, review: true }));
    render(<OfferSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/offer source/i), 'https://thin.example.com');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByTestId('offer-review-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('offer-review-banner')).toHaveTextContent(/review before applying/i);
  });

  it('surfaces an error when the ingest rejects', async () => {
    const ingest = vi.fn(async () => {
      throw new Error('fetch failed: 500 Server Error');
    });
    render(<OfferSection ingest={ingest} />);

    await userEvent.type(screen.getByLabelText(/offer source/i), 'https://broken.example.com');
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not read source/i);
    });
  });

  it('keeps the baseline offer body until an ingest lands (restraint rule)', () => {
    render(<OfferSection />);
    // Baseline offer copy from DEMO_CREATOR_CONTEXT should render.
    expect(screen.getByText(/spring reset duo/i)).toBeInTheDocument();
    expect(screen.queryByTestId('offer-claims-list')).toBeNull();
  });
});

describe('OfferSection · clipboard paste zone', () => {
  it('fires an ingest with kind=clipboard when the drop zone receives a paste event', async () => {
    const ingest: Mock<IngestFn> = vi.fn(async () => ({
      snapshot: HIGH_CONF_SNAPSHOT,
      review: false,
    }));
    render(<OfferSection ingest={ingest} />);

    const zone = screen.getByTestId('offer-drop-zone');
    fireEvent.paste(zone, {
      clipboardData: {
        getData: (mime: string) => {
          if (mime === 'text/html') return '<h1>Spring Reset Duo</h1><ul><li>Ceramide cleanse</li></ul>';
          if (mime === 'text/plain') return 'Spring Reset Duo\n- Ceramide cleanse';
          return '';
        },
      },
    });

    await waitFor(() => {
      expect(ingest).toHaveBeenCalled();
    });
    const call = ingest.mock.calls[0]![0];
    expect(call.kind).toBe('clipboard');
  });
});
