import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeftRail } from '@/components/rail/LeftRail';
import { resetSignalsForTests } from '@/lib/signals/store';
import { resetBrandContextForTests, seedBrandContextForTests } from '@/lib/context/brand-store';
import { DEMO_CREATOR_CONTEXT } from '@/lib/context/model';
import { resetPresenceForTests } from '@/lib/presence/store';

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  resetSignalsForTests();
  resetBrandContextForTests();
  resetPresenceForTests();
});

describe('LeftRail · stable context first, research feeds references', () => {
  it('renders rail sections in creator-loop order', () => {
    const { container } = render(<LeftRail />);

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('[data-rail-section]')
    );
    const ids = sections.map((s) => s.dataset.railSection);
    expect(ids).toEqual([
      'brand',
      'offer',
      'campaign',
      'presence',
      'signals',
      'research',
      'references',
    ]);
  });

  it('drops the deprecated operator-shaped sections (sources, clusters, input-set, product, brief, targets)', () => {
    const { container } = render(<LeftRail />);

    const dropped = ['sources', 'clusters', 'input-set', 'product', 'brief', 'targets'];
    for (const id of dropped) {
      expect(
        container.querySelector(`[data-rail-section="${id}"]`)
      ).toBeNull();
    }
  });

  it('brand section surfaces long-lived knowledge sources from site · repo · docs · assets', async () => {
    // Seed DEMO brand data so the brand section has knowledge sources to display.
    // On a fresh workspace the section starts empty (C1 fix); this test verifies
    // that sources RENDER correctly once they have been ingested.
    seedBrandContextForTests(DEMO_CREATOR_CONTEXT.brand);
    const { container } = render(<LeftRail />);

    const brandTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="brand"]'
    );
    expect(brandTrigger).not.toBeNull();
    await userEvent.click(brandTrigger!);

    const flyout = container.querySelector<HTMLElement>('[data-rail-flyout="brand"]');
    expect(flyout).not.toBeNull();
    expect(screen.getByDisplayValue(/brand site/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/repo/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/uploaded docs/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/assets/i)).toBeInTheDocument();
  });

  it('updates the compact brand source count after a repo evidence ingest', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/brand-ingest')) {
        return new Response(
          JSON.stringify({
            ok: true,
            review: false,
            snapshot: {
              palette: [],
              typography: [],
              voice: { samples: [] },
              logos: [],
              productImages: [],
              confidence: 0.8,
              source: { kind: 'repo', url: 'https://github.com/erniesg/aether' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/evidence/ingest')) {
        return new Response(
          JSON.stringify({
            ok: true,
            persisted: false,
            facts: {
              name: 'aether',
              description: 'Canvas-native creative system.',
              claims: [
                {
                  text: 'aether has 42 GitHub stars.',
                  source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/brand/propose')) {
        return new Response(
          JSON.stringify({
            ok: true,
            offers: [],
            campaigns: [],
            coverage: { ok: true, notes: [] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

    const { container } = render(<LeftRail workspaceId="summary-ws" />);
    const brandTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="brand"]'
    );
    expect(brandTrigger).not.toBeNull();
    expect(brandTrigger).toHaveAttribute('aria-label', 'brand · 0 sources');

    await userEvent.click(brandTrigger!);
    await userEvent.type(
      screen.getByLabelText(/brand source/i),
      'https://github.com/erniesg/aether'
    );
    await userEvent.click(screen.getByRole('button', { name: /ingest/i }));

    await waitFor(() => {
      expect(brandTrigger).toHaveAttribute('aria-label', 'brand · 1 sources');
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('campaign section separates the current goal from stable brand data', async () => {
    const { container } = render(<LeftRail />);

    const campaignTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="campaign"]'
    );
    expect(campaignTrigger).not.toBeNull();
    await userEvent.click(campaignTrigger!);

    const flyout = container.querySelector<HTMLElement>('[data-rail-flyout="campaign"]');
    expect(flyout).not.toBeNull();
    const text = (flyout!.textContent ?? '').toLowerCase();
    expect(text).toContain('goal');
    expect(text).toContain('audience');
    expect(text).toContain('channels');
    expect(text).toContain('cta');
    expect(text).toContain('active input set');
  });

  it('references section exposes images · templates · elements tabs', async () => {
    const { container } = render(<LeftRail />);

    const referencesTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="references"]'
    );
    expect(referencesTrigger).not.toBeNull();
    await userEvent.click(referencesTrigger!);

    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => (t.textContent ?? '').trim().toLowerCase());
    expect(labels).toEqual(['images', 'templates', 'elements']);
  });

  it('research section exposes seed, source, target, and scout controls', async () => {
    const { container } = render(<LeftRail />);

    const researchTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="research"]'
    );
    expect(researchTrigger).not.toBeNull();
    await userEvent.click(researchTrigger!);

    expect(screen.getByLabelText(/research seeds/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /research sources/i })).toBeInTheDocument();
    expect(screen.getByText('targets')).toBeInTheDocument();
    expect(screen.getByTestId('research-run')).toBeInTheDocument();
  });

  it('signals section exposes three CRUD groups (keywords · hashtags · accounts)', async () => {
    const { container } = render(<LeftRail />);

    const signalsTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="signals"]'
    );
    expect(signalsTrigger).not.toBeNull();
    await userEvent.click(signalsTrigger!);

    const flyout = container.querySelector<HTMLElement>(
      '[data-rail-flyout="signals"]'
    );
    expect(flyout).not.toBeNull();

    const groupKinds = Array.from(
      flyout!.querySelectorAll<HTMLElement>('[data-signal-group]')
    ).map((el) => el.dataset.signalGroup);
    expect(groupKinds).toEqual(['keyword', 'hashtag', 'account']);

    expect(screen.getByLabelText(/add keyword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add hashtag/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add account/i)).toBeInTheDocument();
  });

  it('rail root carries input taxonomy contract', () => {
    render(<LeftRail />);
    const rail = screen.getByRole('navigation', { name: /inputs/i });
    expect(rail).toHaveAttribute('data-taxonomy', 'input');
  });
});
