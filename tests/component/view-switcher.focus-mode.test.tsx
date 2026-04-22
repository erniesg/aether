import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/app/design-system/ThemeProvider';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { resetRunsForTests } from '@/lib/store/runs';

afterEach(() => {
  cleanup();
  resetRunsForTests();
});

function renderShell() {
  return render(
    <ThemeProvider>
      <WorkspaceShell wsId="demo-ws" />
    </ThemeProvider>
  );
}

/**
 * Focus is a lens — a camera/selection change on the same project, not a
 * chrome toggle. Rails stay mounted (brief, refs, signals, brand on the
 * left; versions, formats, generations on the right). The shell switches
 * the tldraw camera target via focusFrameAtIndex() — that side-effect path
 * is unit-tested in lib/canvas/focusFrame.test.ts. Here we verify the pill
 * state transitions and the fact that rails are untouched.
 */
describe('ViewSwitcher · focus lens = camera, not chrome', () => {
  it('both rails stay mounted in canvas view (default)', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('clicking the focus pill does NOT hide the rails — context stays visible', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^focus/i }));

    // Rails stay. This is the contract: focus is about the canvas camera,
    // not the shell layout. Creators still need brief/refs/brand while
    // zoomed into a single artboard.
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('the focus pill reports aria-current after a click, canvas after another click', async () => {
    renderShell();

    const canvasPill = screen.getByRole('tab', { name: /^canvas/i });
    const focusPill = screen.getByRole('tab', { name: /^focus/i });

    expect(canvasPill).toHaveAttribute('aria-current', 'page');
    expect(focusPill).not.toHaveAttribute('aria-current');

    await userEvent.click(focusPill);
    await waitFor(() => {
      expect(focusPill).toHaveAttribute('aria-current', 'page');
    });
    expect(canvasPill).not.toHaveAttribute('aria-current');

    await userEvent.click(canvasPill);
    await waitFor(() => {
      expect(canvasPill).toHaveAttribute('aria-current', 'page');
    });
    expect(focusPill).not.toHaveAttribute('aria-current');
  });

  it('⌘+. / Ctrl+. toggles aria-current between canvas and focus', async () => {
    renderShell();
    const canvasPill = screen.getByRole('tab', { name: /^canvas/i });
    const focusPill = screen.getByRole('tab', { name: /^focus/i });

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(focusPill).toHaveAttribute('aria-current', 'page');
    });
    expect(canvasPill).not.toHaveAttribute('aria-current');

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(canvasPill).toHaveAttribute('aria-current', 'page');
    });
    expect(focusPill).not.toHaveAttribute('aria-current');
  });

  it('arrow-key cycling is only armed while the focus lens is active', async () => {
    // This guards against stray listeners in canvas lens. The side-effect
    // (zoom) is covered in focusFrame.test.ts; here we verify the wiring is
    // gated by view — no runtime error when pressing arrows in canvas mode.
    renderShell();

    // Canvas mode: arrow keys should be no-ops (no crash, no state change).
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /^canvas/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
