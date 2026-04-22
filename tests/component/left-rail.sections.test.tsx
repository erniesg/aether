import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeftRail } from '@/components/rail/LeftRail';

afterEach(cleanup);

describe('LeftRail · stable context first, run material last', () => {
  it('renders exactly five rail sections in brand · offer · campaign · references · signals order', () => {
    const { container } = render(<LeftRail />);

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('[data-rail-section]')
    );
    const ids = sections.map((s) => s.dataset.railSection);
    expect(ids).toEqual(['brand', 'offer', 'campaign', 'references', 'signals']);
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
    const { container } = render(<LeftRail />);

    const brandTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="brand"]'
    );
    expect(brandTrigger).not.toBeNull();
    await userEvent.click(brandTrigger!);

    const flyout = container.querySelector<HTMLElement>('[data-rail-flyout="brand"]');
    expect(flyout).not.toBeNull();
    const text = (flyout!.textContent ?? '').toLowerCase();
    expect(text).toContain('brand site');
    expect(text).toContain('repo');
    expect(text).toContain('uploaded docs');
    expect(text).toContain('assets');
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

  it('signals section surfaces three seeded trend rows with platform + lift', async () => {
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
    const text = (flyout!.textContent ?? '').toLowerCase();
    expect(text).toContain('clean-girl');
    expect(text).toContain('tiktok');
    expect(text).toContain('+341%');
    expect(text).toContain('golden-hour');
    expect(text).toContain('instagram');
    expect(text).toContain('+124%');
    expect(text).toContain('slow-morning');
    expect(text).toContain('pinterest');
    expect(text).toContain('+89%');
  });

  it('rail root carries input taxonomy contract', () => {
    render(<LeftRail />);
    const rail = screen.getByRole('navigation', { name: /inputs/i });
    expect(rail).toHaveAttribute('data-taxonomy', 'input');
  });
});
