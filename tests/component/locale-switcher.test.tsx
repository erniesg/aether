import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RightRail } from '@/components/rail/RightRail';
import { CanvasLocaleStrip } from '@/components/canvas/CanvasSubstrate';
import {
  DEFAULT_ACTIVE_LOCALE,
  getActiveLocale,
  getEnabledLocales,
  getLocaleViewMode,
  resetActiveLocaleForTests,
  setEnabledLocales,
  setLocaleViewMode,
} from '@/lib/text-overlay/active-locale';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

afterEach(() => {
  cleanup();
  resetActiveLocaleForTests();
});

describe('RightRail · focus → locale switcher', () => {
  it('renders the supported campaign languages inside the focus flyout', async () => {
    const { container } = render(<RightRail />);
    const focusTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="focus"]'
    );
    expect(focusTrigger).not.toBeNull();
    await userEvent.click(focusTrigger!);

    expect(screen.getByTestId('focus-locale-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-en-SG')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-zh-Hans-SG')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-ms-SG')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-ta-SG')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-ja-JP')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-ko-KR')).toBeInTheDocument();
  });

  it('clicking a locale button enables it and updates the active-locale store', async () => {
    const { container } = render(<RightRail />);
    await userEvent.click(
      container.querySelector<HTMLButtonElement>('[data-rail-section="focus"]')!
    );

    expect(getActiveLocale()).toBe('en-SG');
    expect(getEnabledLocales().map(String)).toEqual(['en-SG']);

    await userEvent.click(screen.getByTestId('locale-switch-zh-Hans-SG'));
    expect(getActiveLocale()).toBe('zh-Hans-SG');
    expect(getEnabledLocales().map(String)).toEqual(['en-SG', 'zh-Hans-SG']);
    expect(screen.getByTestId('locale-switch-zh-Hans-SG').dataset.active).toBe(
      'true'
    );
    expect(screen.getByTestId('locale-switch-en-SG').dataset.active).toBe('false');

    await userEvent.click(screen.getByTestId('locale-switch-ja-JP'));
    expect(getActiveLocale()).toBe('ja-JP');
    expect(getEnabledLocales().map(String)).toEqual([
      'en-SG',
      'zh-Hans-SG',
      'ja-JP',
    ]);
  });

  it('can switch the canvas into multilingual view once multiple languages are enabled', async () => {
    const { container } = render(<RightRail />);
    await userEvent.click(
      container.querySelector<HTMLButtonElement>('[data-rail-section="focus"]')!
    );

    const toggle = screen.getByTestId('locale-view-mode-toggle');
    expect(toggle).toBeDisabled();

    await userEvent.click(screen.getByTestId('locale-switch-ms-SG'));
    expect(toggle).not.toBeDisabled();
    await userEvent.click(toggle);

    expect(getLocaleViewMode()).toBe('multilingual');
  });

  it('surfaces a compact canvas locale strip for multilingual review', async () => {
    const locales = [
      DEFAULT_ACTIVE_LOCALE,
      asBCP47LocaleCode('zh-Hans-SG'),
      asBCP47LocaleCode('ms-SG'),
    ];
    setEnabledLocales(locales);
    setLocaleViewMode('multilingual');

    render(
      <CanvasLocaleStrip
        activeLocale={DEFAULT_ACTIVE_LOCALE}
        enabledLocales={locales}
        localeViewMode="multilingual"
      />
    );

    expect(screen.getByTestId('canvas-locale-strip')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-locale-switch-all').dataset.active).toBe(
      'true'
    );

    await userEvent.click(screen.getByTestId('canvas-locale-switch-zh-Hans-SG'));
    expect(getActiveLocale()).toBe('zh-Hans-SG');
    expect(getLocaleViewMode()).toBe('single');
  });
});
