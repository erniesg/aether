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

describe('ViewSwitcher · focus lens toggles shell surfaces', () => {
  it('canvas view keeps both rails mounted and visible', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('clicking the focus pill hides both rails (canvas takes the full width)', async () => {
    renderShell();

    const focusPill = screen.getByRole('tab', { name: /^focus/i });
    await userEvent.click(focusPill);

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: /inputs/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('navigation', { name: /outputs/i })).not.toBeInTheDocument();
  });

  it('clicking the canvas pill restores both rails', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('tab', { name: /^focus/i }));
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: /inputs/i })).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: /^canvas/i }));
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('navigation', { name: /outputs/i })).toBeInTheDocument();
  });

  it('⌘+. / Ctrl+. keyboard shortcut toggles between canvas and focus', async () => {
    renderShell();

    // canvas → focus via ⌘+.
    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: /inputs/i })).not.toBeInTheDocument();
    });

    // focus → canvas via ⌘+.
    fireEvent.keyDown(window, { key: '.', metaKey: true });
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /inputs/i })).toBeInTheDocument();
    });
  });
});
