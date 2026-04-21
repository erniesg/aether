import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/app/design-system/ThemeProvider';

function Probe() {
  const { theme, mode, cycle } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={cycle}>
        cycle
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    // jsdom needs a matchMedia shim
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system mode and applies light when prefers-color-scheme is light', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('mode').textContent).toBe('system');
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles system → light → dark → synth → system', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    const cycle = screen.getByRole('button', { name: 'cycle' });

    // starts at system (resolved to light)
    expect(screen.getByTestId('mode').textContent).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => cycle.click()); // → light
    expect(screen.getByTestId('mode').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => cycle.click()); // → dark
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => cycle.click()); // → synth
    expect(screen.getByTestId('mode').textContent).toBe('synth');
    expect(document.documentElement.getAttribute('data-theme')).toBe('synth');

    act(() => cycle.click()); // → system (resolves to light)
    expect(screen.getByTestId('mode').textContent).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists the chosen mode to localStorage', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    const cycle = screen.getByRole('button', { name: 'cycle' });
    act(() => cycle.click()); // system → light
    act(() => cycle.click()); // light → dark

    expect(window.localStorage.getItem('aether.theme')).toBe('dark');
  });
});
