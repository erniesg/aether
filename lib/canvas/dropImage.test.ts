import { describe, expect, it, vi } from 'vitest';
import { dropImageOnCanvas } from './dropImage';

type MockEditor = {
  createAssets: ReturnType<typeof vi.fn>;
  getViewportPageBounds: () => { w: number; h: number; midX: number; midY: number };
  createShape: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  zoomToSelection: ReturnType<typeof vi.fn>;
};

function makeEditor(): MockEditor {
  return {
    createAssets: vi.fn(),
    getViewportPageBounds: () => ({ w: 2000, h: 1200, midX: 1000, midY: 600 }),
    createShape: vi.fn(),
    select: vi.fn(),
    zoomToSelection: vi.fn(),
  };
}

describe('dropImageOnCanvas', () => {
  it('creates an asset + shape, selects it, and zooms', () => {
    const editor = makeEditor();
    const id = dropImageOnCanvas(editor as never, {
      url: 'https://example.com/x.png',
      width: 1024,
      height: 1024,
      mimeType: 'image/png',
      label: 'sunset',
    });

    expect(typeof id).toBe('string');
    expect(editor.createAssets).toHaveBeenCalledTimes(1);
    const [[asset]] = editor.createAssets.mock.calls[0]!;
    expect(asset.type).toBe('image');
    expect(asset.typeName).toBe('asset');
    expect(asset.props.src).toBe('https://example.com/x.png');
    expect(asset.props.name).toBe('sunset');

    expect(editor.createShape).toHaveBeenCalledTimes(1);
    const shape = editor.createShape.mock.calls[0]![0];
    expect(shape.type).toBe('image');
    expect(shape.props.assetId).toBe(asset.id);
    expect(typeof shape.props.w).toBe('number');
    expect(typeof shape.props.h).toBe('number');
    expect(shape.props.w).toBeGreaterThan(0);
    expect(shape.props.h).toBeGreaterThan(0);

    expect(editor.select).toHaveBeenCalledWith(shape.id);
    expect(editor.zoomToSelection).toHaveBeenCalledTimes(1);
  });

  it('scales images larger than the viewport to fit', () => {
    const editor = makeEditor();
    dropImageOnCanvas(editor as never, {
      url: 'x',
      width: 4000,
      height: 4000,
    });
    const shape = editor.createShape.mock.calls[0]![0];
    // Viewport minor dim 1200, max scale target 1200 * 0.7 = 840.
    expect(shape.props.w).toBeLessThanOrEqual(840);
    expect(shape.props.h).toBeLessThanOrEqual(840);
  });

  it('falls back to a generic name when no label is provided', () => {
    const editor = makeEditor();
    dropImageOnCanvas(editor as never, {
      url: 'x',
      width: 100,
      height: 100,
    });
    const [[asset]] = editor.createAssets.mock.calls[0]!;
    expect(asset.props.name).toBe('generated');
    expect(asset.props.mimeType).toBe('image/png');
  });
});
