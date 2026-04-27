/**
 * Behavior contract for VariationActions:
 *   - status !== 'ready' → renders nothing (no actions to take)
 *   - callback mode (onApprove provided): clicking primaries delegates with
 *     the right (notifyMode, forcePostNow) tuple
 *   - self-fetch mode (no onApprove): clicking primaries fetches /api/auto-
 *     mode/post-now or /api/auto-mode/approve with the right body shape
 *   - schedule button toggles a datetime input; confirm fires
 *     (auto-post, false)
 *   - reject button is hidden in self-fetch mode (no onReject) since
 *     /api/auto-mode/reject is GET-only and would route the browser away
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VariationActions } from '@/components/rail/VariationActions';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VariationActions', () => {
  it('renders nothing when status is not ready', () => {
    const { container } = render(
      <VariationActions
        campaignId="c1"
        variationIndex={1}
        status="failed"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('callback mode: post now invokes onApprove with (auto-post, true)', async () => {
    const onApprove = vi.fn(async () => undefined);
    render(
      <VariationActions
        campaignId="c1"
        variationIndex={2}
        status="ready"
        onApprove={onApprove}
      />
    );
    fireEvent.click(screen.getByTestId('variation-post-now-2'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('auto-post', true));
  });

  it('callback mode: approve invokes onApprove with just (review) — forcePostNow omitted when false', async () => {
    // Why omit: keeps the parent's call shape minimal so the AutoModePanel
    // existing test contract `onApprove(idx, "review")` (2 args) continues
    // to hold and we don't accidentally pass a falsy third arg.
    const onApprove = vi.fn(async () => undefined);
    render(
      <VariationActions
        campaignId="c1"
        variationIndex={3}
        status="ready"
        onApprove={onApprove}
      />
    );
    fireEvent.click(screen.getByTestId('variation-approve-3'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('review'));
  });

  it('self-fetch mode: post now POSTs to /api/auto-mode/post-now with the right body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, scheduledPostIds: ['p1'] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VariationActions
        campaignId="campaign-xyz"
        variationIndex={4}
        workspaceId="ws-foo"
        status="ready"
      />
    );
    fireEvent.click(screen.getByTestId('variation-post-now-4'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auto-mode/post-now');
    expect(JSON.parse(String(init.body))).toEqual({
      campaignId: 'campaign-xyz',
      variationIndex: 4,
      workspaceId: 'ws-foo',
    });
  });

  it('self-fetch mode: approve POSTs to /api/auto-mode/approve with notifyMode=review', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VariationActions
        campaignId="campaign-xyz"
        variationIndex={5}
        status="ready"
      />
    );
    fireEvent.click(screen.getByTestId('variation-approve-5'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auto-mode/approve');
    expect(JSON.parse(String(init.body))).toMatchObject({
      campaignId: 'campaign-xyz',
      variationIndex: 5,
      notifyMode: 'review',
    });
  });

  it('schedule: toggle reveals datetime input; confirm fires (auto-post)', async () => {
    const onApprove = vi.fn(async () => undefined);
    render(
      <VariationActions
        campaignId="c1"
        variationIndex={6}
        status="ready"
        onApprove={onApprove}
      />
    );
    // Input not visible until schedule is clicked.
    expect(screen.queryByTestId('variation-schedule-input-6')).toBeNull();
    fireEvent.click(screen.getByTestId('variation-schedule-6'));
    const input = screen.getByTestId('variation-schedule-input-6') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-04-28T12:00' } });
    fireEvent.click(screen.getByTestId('variation-schedule-confirm-6'));
    // Parent receives (auto-post) — forcePostNow falsy ⇒ omitted.
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('auto-post'));
  });

  it('hides reject button in self-fetch mode (no onReject) — Convex doc id not available', () => {
    render(
      <VariationActions
        campaignId="c1"
        variationIndex={7}
        status="ready"
      />
    );
    expect(screen.queryByTestId('variation-reject-7')).toBeNull();
  });

  it('shows reject button in callback mode and forwards to onReject', async () => {
    const onReject = vi.fn(async () => undefined);
    const onApprove = vi.fn(async () => undefined);
    render(
      <VariationActions
        campaignId="c1"
        variationIndex={8}
        status="ready"
        onApprove={onApprove}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByTestId('variation-reject-8'));
    await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
  });

  it('surfaces fetch errors as a small error line', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: 'variation not found in Convex' }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VariationActions
        campaignId="missing"
        variationIndex={9}
        status="ready"
      />
    );
    fireEvent.click(screen.getByTestId('variation-post-now-9'));
    await waitFor(() =>
      expect(screen.getByText(/variation not found in Convex/i)).toBeInTheDocument()
    );
  });
});
