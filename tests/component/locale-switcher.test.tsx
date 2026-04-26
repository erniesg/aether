import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RightRail } from '@/components/rail/RightRail';
import {
  getActiveLocale,
  resetActiveLocaleForTests,
} from '@/lib/text-overlay/active-locale';

afterEach(() => {
  cleanup();
  resetActiveLocaleForTests();
});

describe('RightRail · focus → locale switcher', () => {
  it('renders the three demo locales inside the focus flyout', async () => {
    const { container } = render(<RightRail />);
    const focusTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="focus"]'
    );
    expect(focusTrigger).not.toBeNull();
    await userEvent.click(focusTrigger!);

    expect(screen.getByTestId('focus-locale-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-en')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-zh-Hans')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-ja-JP')).toBeInTheDocument();
  });

  it('clicking a locale button updates the active-locale store', async () => {
    const { container } = render(<RightRail />);
    await userEvent.click(
      container.querySelector<HTMLButtonElement>('[data-rail-section="focus"]')!
    );

    expect(getActiveLocale()).toBe('en');

    await userEvent.click(screen.getByTestId('locale-switch-zh-Hans'));
    expect(getActiveLocale()).toBe('zh-Hans');
    expect(screen.getByTestId('locale-switch-zh-Hans').dataset.active).toBe(
      'true'
    );
    expect(screen.getByTestId('locale-switch-en').dataset.active).toBe('false');

    await userEvent.click(screen.getByTestId('locale-switch-ja-JP'));
    expect(getActiveLocale()).toBe('ja-JP');
  });
});
