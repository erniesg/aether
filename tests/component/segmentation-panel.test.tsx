import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { SegmentationPanel } from '@/components/canvas/SegmentationPanel';

afterEach(cleanup);

function renderPanel(props: Partial<ComponentProps<typeof SegmentationPanel>> = {}) {
  const handlers = {
    onPromptChange: vi.fn(),
    onProviderChange: vi.fn(),
    onPreview: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onClose: vi.fn(),
    onBackgroundModeChange: vi.fn(),
    onBackgroundColorAChange: vi.fn(),
    onBackgroundColorBChange: vi.fn(),
    onBackgroundOpacityChange: vi.fn(),
    onApplyBackground: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };

  render(
    <SegmentationPanel
      open
      verb="removebg"
      providerId="sam3"
      prompt="main subject"
      backgroundFill={{
        mode: 'solid',
        colorA: '#f4efe6',
        colorB: '#0f172a',
        opacity: 0.85,
      }}
      {...handlers}
      {...props}
    />
  );

  return handlers;
}

describe('SegmentationPanel', () => {
  it('renders prompt and provider controls for previewing a cutout', async () => {
    const handlers = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /sam2/i }));
    expect(handlers.onProviderChange).toHaveBeenCalledWith('sam2');

    await userEvent.click(screen.getByRole('button', { name: /preview outline/i }));
    expect(handlers.onPreview).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(handlers.onUndo).toHaveBeenCalled();
  });

  it('shows approval and background controls after a preview is approved', async () => {
    const handlers = renderPanel({
      approved: true,
      preview: {
        sourceDataUrl: 'data:image/png;base64,aaa',
        maskDataUrl: 'data:image/png;base64,bbb',
        cutoutDataUrl: 'data:image/svg+xml,ccc',
        width: 1024,
        height: 1024,
      },
      backgroundFill: {
        mode: 'gradient',
        colorA: '#ff6b6b',
        colorB: '#0f172a',
        opacity: 0.6,
      },
    });

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply background/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /apply background/i }));
    expect(handlers.onApplyBackground).toHaveBeenCalled();
  });
});
