import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { RightRail } from '@/components/rail/RightRail';
import { resetRunsForTests } from '@/lib/store/runs';

function openFocus(container: HTMLElement): void {
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-rail-section="focus"]'
  );
  if (!trigger) throw new Error('focus section trigger missing');
  fireEvent.click(trigger);
}

describe('RightRail export button', () => {
  beforeEach(() => resetRunsForTests());
  afterEach(() => cleanup());

  it('renders an `export` header action on the `this focus` section when onExport is supplied', () => {
    const onExport = vi.fn();
    const { container } = render(<RightRail onExport={onExport} />);
    openFocus(container);

    const exportBtn = screen.getByTestId('rail-export-button');
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toHaveAttribute('aria-label', 'export');

    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('omits the export affordance when no handler is supplied', () => {
    const { container } = render(<RightRail />);
    openFocus(container);
    expect(screen.queryByTestId('rail-export-button')).toBeNull();
  });

  it('disables the button while an export is in flight', () => {
    const onExport = vi.fn();
    const { container } = render(
      <RightRail onExport={onExport} exportDisabled />
    );
    openFocus(container);
    const exportBtn = screen.getByTestId('rail-export-button');
    expect(exportBtn).toBeDisabled();
  });
});
