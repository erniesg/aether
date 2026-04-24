import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectedImageActions } from '@/components/canvas/SelectedImageActions';

afterEach(cleanup);

describe('SelectedImageActions', () => {
  it('renders remove-bg and segment entrypoints beside the selected image', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onDownloadOriginal={vi.fn()}
      />
    );

    expect(screen.getByRole('toolbar', { name: /selected image actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove bg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /segment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download original/i })).toBeInTheDocument();
  });

  it('routes direct remove-bg clicks through the dedicated handler', async () => {
    const onRemoveBg = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={onRemoveBg}
        onCutout={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /remove bg/i }));
    expect(onRemoveBg).toHaveBeenCalledTimes(1);
  });

  it('routes selected image downloads through the dedicated handler', async () => {
    const onDownloadOriginal = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onDownloadOriginal={onDownloadOriginal}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /download original/i }));
    expect(onDownloadOriginal).toHaveBeenCalledTimes(1);
  });

  it('shows a hide-preview toggle while a cutout preview is visible', async () => {
    const onPreviewVisibilityChange = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        hasPreview
        previewVisible
        onPreviewVisibilityChange={onPreviewVisibilityChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /hide preview/i }));
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(false);
  });

  it('renders an edit-region entry when onEditRegion is provided', async () => {
    const onEditRegion = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        onEditRegion={onEditRegion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /edit region/i }));
    expect(onEditRegion).toHaveBeenCalledTimes(1);
  });

  it('omits the edit-region entry when onEditRegion is not provided', () => {
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /edit region/i })).toBeNull();
  });

  it('shows a show-preview toggle when preview data exists but is hidden', async () => {
    const onPreviewVisibilityChange = vi.fn();
    render(
      <SelectedImageActions
        rect={{ x: 80, y: 120, w: 480, h: 640 }}
        onRemoveBg={vi.fn()}
        onCutout={vi.fn()}
        hasPreview
        previewVisible={false}
        onPreviewVisibilityChange={onPreviewVisibilityChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /show preview/i }));
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(true);
  });
});
