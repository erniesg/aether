import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { SegmentationPanel } from '@/components/canvas/SegmentationPanel';
import type { SegmentationProviderStatus } from '@/lib/providers/segmentation/types';

afterEach(cleanup);

const DEFAULT_PROVIDERS: SegmentationProviderStatus[] = [
  {
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    models: ['sam3.1'],
    supportsTextPrompt: true,
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
    available: true,
  },
  {
    id: 'sam2',
    displayName: 'SAM 2 via Replicate',
    models: ['meta/sam-2'],
    supportsTextPrompt: false,
    supportsPointPrompt: false,
    supportsBoxPrompt: false,
    available: false,
    unavailableReason: 'Replicate SAM 2 is not connected',
  },
];

function renderPanel(props: Partial<ComponentProps<typeof SegmentationPanel>> = {}) {
  const handlers = {
    onPromptChange: vi.fn(),
    onProviderChange: vi.fn(),
    onRefinementModeChange: vi.fn(),
    onClearRefinement: vi.fn(),
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
      providers={DEFAULT_PROVIDERS}
      pointCount={0}
      hasBox={false}
      refinementMode={null}
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

    expect(screen.getByRole('button', { name: /sam2/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /preview outline/i }));
    expect(handlers.onPreview).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(handlers.onUndo).toHaveBeenCalled();
  });

  it('lets sam3 toggle point and box refinement controls', async () => {
    const handlers = renderPanel({ pointCount: 1 });

    await userEvent.click(screen.getByRole('button', { name: /fg point/i }));
    expect(handlers.onRefinementModeChange).toHaveBeenCalledWith('point-fg');

    await userEvent.click(screen.getByRole('button', { name: /box/i }));
    expect(handlers.onRefinementModeChange).toHaveBeenCalledWith('box');

    await userEvent.click(screen.getByRole('button', { name: /clear hints/i }));
    expect(handlers.onClearRefinement).toHaveBeenCalled();
  });

  it('disables preview when no provider is available', () => {
    renderPanel({
      providers: DEFAULT_PROVIDERS.map((provider) => ({
        ...provider,
        available: false,
      })),
    });

    expect(screen.getByRole('button', { name: /preview outline/i })).toBeDisabled();
  });

  it('disables prompt input for providers without text prompting', async () => {
    const handlers = renderPanel({
      providerId: 'sam2',
      providers: [
        DEFAULT_PROVIDERS[0]!,
        { ...DEFAULT_PROVIDERS[1]!, available: true, unavailableReason: undefined },
      ],
    });

    expect(screen.getByRole('textbox', { name: /prompt/i })).toBeDisabled();
    expect(
      screen.getByText(/sam2 uses automatic masks\. text prompt support lives on sam3\./i)
    ).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /prompt/i }), 'ignored');
    expect(handlers.onPromptChange).not.toHaveBeenCalled();
  });

  it('disables interactive refinement controls for providers without refinement prompts', () => {
    renderPanel({
      providerId: 'sam2',
      providers: [
        DEFAULT_PROVIDERS[0]!,
        {
          ...DEFAULT_PROVIDERS[1]!,
          available: true,
          unavailableReason: undefined,
        },
      ],
    });

    expect(screen.getByRole('button', { name: /fg point/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /bg point/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /box/i })).toBeDisabled();
    expect(
      screen.getByText(/interactive refinement lives on sam3\./i)
    ).toBeInTheDocument();
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
