import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeftRail } from '@/components/rail/LeftRail';

afterEach(cleanup);

describe('LeftRail · collapsed to four creator-facing sections', () => {
  it('renders exactly four rail sections in brief · references · signals · brand order', () => {
    const { container } = render(<LeftRail />);

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('[data-rail-section]')
    );
    const ids = sections.map((s) => s.dataset.railSection);
    expect(ids).toEqual(['brief', 'references', 'signals', 'brand']);
  });

  it('drops the deprecated operator-shaped sections (sources, clusters, input-set, product, targets)', () => {
    const { container } = render(<LeftRail />);

    const dropped = ['sources', 'clusters', 'input-set', 'product', 'targets'];
    for (const id of dropped) {
      expect(
        container.querySelector(`[data-rail-section="${id}"]`)
      ).toBeNull();
    }
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
