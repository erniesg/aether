/**
 * Component tests for AutoModePanel — approve / reject / schedule affordances.
 *
 * Tests verify:
 *   - null campaign renders idle state
 *   - ready variation shows approve + reject + schedule buttons
 *   - approve callback fires with correct variationIndex + notifyMode
 *   - reject callback fires with correct variationIndex
 *   - post-approve, the approve row collapses to "approved" text
 *   - post-reject, the button row is hidden
 *   - schedule picker opens on "schedule" click, confirm fires onApprove('auto-post')
 *   - pending / running / failed variations do NOT show approve/reject buttons
 *   - atlas chip renders the locale + format crops chips
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoModePanel } from '@/components/rail/sections/AutoModePanel';
import type { AutoModeCampaignView, AutoModeVariationView } from '@/components/rail/sections/AutoModePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<AutoModeCampaignView> = {}): AutoModeCampaignView {
  return {
    id: 'campaign-1',
    triggerKind: 'url',
    triggerPayload: 'https://example.com/product',
    variationCount: 2,
    notifyMode: 'review',
    status: 'completed',
    startedAt: Date.now() - 30_000,
    ...overrides,
  };
}

function makeVariation(overrides: Partial<AutoModeVariationView> = {}): AutoModeVariationView {
  return {
    id: 'var-1',
    index: 0,
    status: 'ready',
    agentRunIds: [],
    startedAt: Date.now() - 10_000,
    finishedAt: Date.now() - 1_000,
    caption: 'A great product for you',
    hashtags: ['#sale', '#product'],
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Null campaign state
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · idle state', () => {
  it('renders idle prompt when no campaign is provided', () => {
    render(<AutoModePanel campaign={null} variations={[]} />);
    expect(screen.getByText(/no lap yet/i)).toBeInTheDocument();
  });

  it('does not render approve / reject buttons in idle state', () => {
    render(<AutoModePanel campaign={null} variations={[]} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Campaign status display
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · campaign metadata', () => {
  it('shows the trigger payload truncated', () => {
    render(<AutoModePanel campaign={makeCampaign()} variations={[]} />);
    expect(screen.getByText('https://example.com/product')).toBeInTheDocument();
  });

  it('shows variation ready count in the status line', () => {
    const variations = [
      makeVariation({ id: 'v1', index: 0, status: 'ready' }),
      makeVariation({ id: 'v2', index: 1, status: 'pending' }),
    ];
    render(<AutoModePanel campaign={makeCampaign({ variationCount: 2 })} variations={variations} />);
    // "1/2 ready"
    expect(screen.getByText(/1\/2 ready/)).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Approve / reject buttons — only shown for ready variations
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · approve / reject', () => {
  it('shows approve + reject buttons for a ready variation', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ status: 'ready' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
  });

  it('does NOT show approve/reject for pending variation', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ status: 'pending' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it('does NOT show approve/reject for failed variation', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ status: 'failed' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('does NOT show approve/reject for running variation', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ status: 'running' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('calls onApprove with variationIndex=0 and notifyMode=review on approve click', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ index: 0 })]}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onApprove).toHaveBeenCalledWith(0, 'review');
  });

  it('calls onReject with the correct variationIndex on reject click', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ index: 3 })]}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(onReject).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledWith(3);
  });

  it('shows "approved" text and hides buttons after successful approve', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
  });

  it('hides buttons after successful reject', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
  });

  it('disables both buttons while approve is in-flight', async () => {
    let resolveApprove!: () => void;
    const onApprove = vi.fn(
      () => new Promise<void>((resolve) => { resolveApprove = resolve; })
    );

    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );

    const approveBtn = screen.getByRole('button', { name: /^approve$/i });
    const rejectBtn = screen.getByRole('button', { name: /^reject$/i });

    // Click approve but don't resolve yet
    await userEvent.click(approveBtn);

    expect(screen.getByRole('button', { name: /approving/i })).toBeDisabled();
    expect(rejectBtn).toBeDisabled();

    resolveApprove();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Schedule picker
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · schedule picker', () => {
  it('reveals a datetime input + confirm button when "schedule" is clicked', async () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^schedule$/i }));
    expect(screen.getByRole('button', { name: /confirm & post/i })).toBeInTheDocument();
  });

  it('confirm button is disabled until a date is entered', async () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^schedule$/i }));
    expect(screen.getByRole('button', { name: /confirm & post/i })).toBeDisabled();
  });

  it('fires onApprove with "auto-post" when confirm is clicked after entering a date', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation({ index: 1 })]}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^schedule$/i }));

    const dateInput = screen.getByDisplayValue('');
    await userEvent.type(dateInput, '2026-05-01T10:00');

    await userEvent.click(screen.getByRole('button', { name: /confirm & post/i }));
    expect(onApprove).toHaveBeenCalledWith(1, 'auto-post');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Locale + format crop chips
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · locale and format chips', () => {
  it('renders locale chips for captionsByLocale entries', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[
          makeVariation({
            captionsByLocale: {
              'en-SG': 'English caption',
              'zh-Hans-SG': '中文标题',
            },
          }),
        ]}
      />
    );

    expect(screen.getByTitle('en-SG')).toBeInTheDocument();
    expect(screen.getByTitle('zh-Hans-SG')).toBeInTheDocument();
  });

  it('renders format crop chips with aspectRatio label', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[
          makeVariation({
            formatCrops: [
              { formatId: 'feed-1x1', aspectRatio: '1:1', w: 1080, h: 1080, fit: 'cover' },
              { formatId: 'story-9x16', aspectRatio: '9:16', w: 1080, h: 1920, fit: 'cover' },
            ],
          }),
        ]}
      />
    );

    expect(screen.getByTitle('1:1 (cover)')).toBeInTheDocument();
    expect(screen.getByTitle('9:16 (cover)')).toBeInTheDocument();
  });

  it('renders up to 3 hashtags inline, then a "+N" chip', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[
          makeVariation({
            hashtags: ['#a', '#b', '#c', '#d', '#e'],
          }),
        ]}
      />
    );

    expect(screen.getByText('#a')).toBeInTheDocument();
    expect(screen.getByText('#b')).toBeInTheDocument();
    expect(screen.getByText('#c')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('#d')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// LANE-C — Research signals (B2 bundle surfaced in the right rail)
// ──────────────────────────────────────────────────────────────────────────────

describe('AutoModePanel · research signals', () => {
  it('omits the research signals row when researchBundle is undefined', () => {
    render(<AutoModePanel campaign={makeCampaign()} variations={[makeVariation()]} />);
    expect(screen.queryByTestId('auto-mode-research-toggle')).toBeNull();
  });

  it('renders a collapsed summary chip with counts when researchBundle is provided', () => {
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        researchBundle={{
          summary: 'Sleep tech market — premium wellness segment',
          competitors: ['Casper', 'Saatva', 'Tempur'],
          recentCampaigns: ['Casper Spring Sale'],
          localeInsights: [
            { locale: 'en-SG', insight: 'Wellness angle resonates' },
            { locale: 'zh-Hans-SG', insight: '健康睡眠诉求' },
          ],
          sources: [
            { url: 'https://casper.com', snippet: 'Casper home', retrievedAt: '2026-04-27T00:00:00Z' },
          ],
          latencyMs: 12_000,
          usedManagedAgentsApi: true,
        }}
      />
    );

    const toggle = screen.getByTestId('auto-mode-research-toggle');
    expect(toggle).toBeInTheDocument();
    // Collapsed by default: counts visible, body hidden.
    expect(toggle.textContent).toMatch(/3 comps?/i);
    expect(toggle.textContent).toMatch(/2 locales?/i);
    expect(toggle.textContent).toMatch(/1 sources?/i);
    expect(screen.queryByTestId('auto-mode-research-body')).toBeNull();
  });

  it('expands to show competitor chips and locale insights on click', async () => {
    const user = userEvent.setup();
    render(
      <AutoModePanel
        campaign={makeCampaign()}
        variations={[makeVariation()]}
        researchBundle={{
          summary: 'sample',
          competitors: ['Casper', 'Saatva'],
          recentCampaigns: [],
          localeInsights: [
            { locale: 'en-SG', insight: 'Wellness angle resonates' },
            { locale: 'ms-SG', insight: 'Family-focused messaging' },
          ],
          sources: [],
          latencyMs: 0,
          usedManagedAgentsApi: false,
        }}
      />
    );

    await user.click(screen.getByTestId('auto-mode-research-toggle'));

    expect(screen.getByTestId('auto-mode-research-body')).toBeInTheDocument();
    expect(screen.getByText('Casper')).toBeInTheDocument();
    expect(screen.getByText('Saatva')).toBeInTheDocument();
    expect(screen.getByText(/Wellness angle resonates/i)).toBeInTheDocument();
    expect(screen.getByText(/Family-focused messaging/i)).toBeInTheDocument();
  });
});
