import { describe, expect, it, vi } from 'vitest';
import { placeDecomposedLayers } from './layerGroup';
import type { DecomposeResult } from './decomposeToLayers';

type MockEditor = {
  markHistoryStoppingPoint: ReturnType<typeof vi.fn>;
  createAssets: ReturnType<typeof vi.fn>;
  createShape: ReturnType<typeof vi.fn>;
  updateShape: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

function makeEditor(): MockEditor {
  return {
    markHistoryStoppingPoint: vi.fn(),
    createAssets: vi.fn(),
    createShape: vi.fn(),
    updateShape: vi.fn(),
    select: vi.fn(),
  };
}

const TARGET = {
  shapeId: 'shape:hero',
  assetId: 'asset:hero',
  sourceUrl: 'https://cdn.example/hero.png',
  intrinsicWidth: 1024,
  intrinsicHeight: 1280,
  x: 50,
  y: 60,
  width: 512,
  height: 640,
  parentId: 'shape:frame-1',
  meta: { existing: 'kept' },
};

const RESULT: DecomposeResult = {
  subject: {
    url: 'data:image/png;base64,Y3V0b3V0',
    bbox: { x: 100, y: 200, w: 400, h: 600 },
  },
  background: { url: 'https://replicate.delivery/bg.png' },
  maskUrl: 'data:image/png;base64,bWFzaw==',
  width: 1024,
  height: 1280,
  providers: {
    segmentation: { id: 'sam3', model: 'sam3.1' },
    edit: { id: 'replicate', model: 'black-forest-labs/flux-fill-pro' },
  },
};

describe('placeDecomposedLayers', () => {
  it('swaps the original to the background plate and stacks the subject above', () => {
    const editor = makeEditor();
    const placed = placeDecomposedLayers(editor as never, TARGET, RESULT);

    expect(editor.markHistoryStoppingPoint).toHaveBeenCalledWith('split layers');

    // Two assets: background + subject cutout.
    const assets = editor.createAssets.mock.calls.flatMap((call) => call[0]);
    expect(assets).toHaveLength(2);
    const srcs = assets.map((a: { props: { src: string } }) => a.props.src);
    expect(srcs).toContain('https://replicate.delivery/bg.png');
    expect(srcs).toContain('data:image/png;base64,Y3V0b3V0');

    // Original shape becomes the background layer, keeping prior meta.
    const update = editor.updateShape.mock.calls[0]![0];
    expect(update.id).toBe('shape:hero');
    expect(update.meta.aetherRole).toBe('layer-background');
    expect(update.meta.existing).toBe('kept');
    expect(update.meta.aetherOriginalSrc).toBe('https://cdn.example/hero.png');
    expect(typeof update.meta.aetherLayerGroupId).toBe('string');

    // Subject layer covers the same rect in the same parent frame.
    const created = editor.createShape.mock.calls[0]![0];
    expect(created.type).toBe('image');
    expect(created.parentId).toBe('shape:frame-1');
    expect(created.x).toBe(50);
    expect(created.y).toBe(60);
    expect(created.props.w).toBe(512);
    expect(created.props.h).toBe(640);
    expect(created.meta.aetherRole).toBe('layer-subject');
    expect(created.meta.aetherLayerGroupId).toBe(update.meta.aetherLayerGroupId);

    expect(editor.select).toHaveBeenCalledWith(placed.subjectShapeId);
    expect(placed.backgroundShapeId).toBe('shape:hero');
  });

  it('records provider provenance on both layers', () => {
    const editor = makeEditor();
    placeDecomposedLayers(editor as never, TARGET, RESULT);
    const update = editor.updateShape.mock.calls[0]![0];
    const created = editor.createShape.mock.calls[0]![0];
    expect(update.meta.aetherEditProvider).toBe('replicate');
    expect(created.meta.aetherSegmentationProvider).toBe('sam3');
  });
});
