import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SelectedImageActions,
  type AlignAction,
  type DistributeAction,
  type OrderAction,
} from '@/components/canvas/SelectedImageActions';

afterEach(cleanup);

describe('SelectedImageActions · segmentation entrypoints', () => {
  it('renders remove-bg and segment entrypoints beside the selected image', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    expect(screen.getByRole('toolbar', { name: /selected image actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove bg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /segment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /particles/i })).toBeInTheDocument();
  });

  it('routes direct remove-bg clicks through the dedicated handler', async () => {
    const onRemoveBg = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={onRemoveBg}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /remove bg/i }));
    expect(onRemoveBg).toHaveBeenCalledTimes(1);
  });

  it('shows a hide-preview toggle while a cutout preview is visible', async () => {
    const onPreviewVisibilityChange = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
        hasPreview
        previewVisible
        onPreviewVisibilityChange={onPreviewVisibilityChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /hide preview/i }));
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(false);
  });

  it('shows a show-preview toggle when preview data exists but is hidden', async () => {
    const onPreviewVisibilityChange = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
        hasPreview
        previewVisible={false}
        onPreviewVisibilityChange={onPreviewVisibilityChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /show preview/i }));
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('routes the particles action through the spatial handler', async () => {
    const onSpatialize = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={onSpatialize}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /particles/i }));
    expect(onSpatialize).toHaveBeenCalledTimes(1);
  });

  it('hides segmentation entrypoints when the selection is not a single image', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        selectionCount={2}
        isSingleImage={false}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /remove bg/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /segment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /particles/i })).not.toBeInTheDocument();
  });
});

describe('SelectedImageActions · opacity', () => {
  it('renders an opacity slider with a numeric readout for single-shape selection', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        opacity={0.75}
        onOpacityChange={vi.fn()}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider', { name: /opacity/i }) as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.value).toBe('75');
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('fires onOpacityChange with a fractional value (0–1) when the slider moves', () => {
    const onOpacityChange = vi.fn<(next: number) => void>();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        opacity={1}
        onOpacityChange={onOpacityChange}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider', { name: /opacity/i });
    fireEvent.change(slider, { target: { value: '40' } });

    expect(onOpacityChange).toHaveBeenCalledTimes(1);
    expect(onOpacityChange.mock.calls[0][0]).toBeCloseTo(0.4, 5);
  });

  it('hides the opacity slider when there is no single selection', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        selectionCount={2}
        isSingleImage={false}
        opacity={1}
        onOpacityChange={vi.fn()}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    expect(screen.queryByRole('slider', { name: /opacity/i })).not.toBeInTheDocument();
  });
});

describe('SelectedImageActions · order', () => {
  it('exposes the four z-order controls and dispatches the correct action', async () => {
    const onOrder = vi.fn<(action: OrderAction) => void>();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onOrder={onOrder}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /bring forward/i }));
    await userEvent.click(screen.getByRole('button', { name: /bring to front/i }));
    await userEvent.click(screen.getByRole('button', { name: /send backward/i }));
    await userEvent.click(screen.getByRole('button', { name: /send to back/i }));

    expect(onOrder.mock.calls.map(([action]) => action)).toEqual([
      'bring-forward',
      'bring-to-front',
      'send-backward',
      'send-to-back',
    ]);
  });
});

describe('SelectedImageActions · align + distribute', () => {
  it('hides the align strip for single-shape selection', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        selectionCount={1}
        onAlign={vi.fn()}
        onDistribute={vi.fn()}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /align left/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /distribute horizontal/i })).not.toBeInTheDocument();
  });

  it('shows 6 align + 2 distribute controls when ≥2 shapes are selected', async () => {
    const onAlign = vi.fn<(action: AlignAction) => void>();
    const onDistribute = vi.fn<(action: DistributeAction) => void>();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        selectionCount={2}
        isSingleImage={false}
        onAlign={onAlign}
        onDistribute={onDistribute}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onSpatialize={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /align left/i }));
    await userEvent.click(screen.getByRole('button', { name: /align center-horizontal/i }));
    await userEvent.click(screen.getByRole('button', { name: /align right/i }));
    await userEvent.click(screen.getByRole('button', { name: /align top/i }));
    await userEvent.click(screen.getByRole('button', { name: /align center-vertical/i }));
    await userEvent.click(screen.getByRole('button', { name: /align bottom/i }));

    expect(onAlign.mock.calls.map(([action]) => action)).toEqual([
      'left',
      'center-horizontal',
      'right',
      'top',
      'center-vertical',
      'bottom',
    ]);

    await userEvent.click(screen.getByRole('button', { name: /distribute horizontal/i }));
    await userEvent.click(screen.getByRole('button', { name: /distribute vertical/i }));

    expect(onDistribute.mock.calls.map(([action]) => action)).toEqual([
      'horizontal',
      'vertical',
    ]);
  });
});
