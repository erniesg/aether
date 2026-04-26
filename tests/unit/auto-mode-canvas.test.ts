/**
 * Unit tests for lib/auto-mode/canvas.ts
 *
 * These tests use a minimal mock of the tldraw Editor to keep the suite
 * fast and free of browser globals. We verify that:
 *   - dropVariationOnCanvas returns null when there is no image URL
 *   - it creates format frames + images when heroImageUrl is provided
 *   - it prefers atlasUrl over heroImageUrl when both are present
 *   - text overlay shapes are created for each overlay with a bbox
 *   - overlays without a bbox are skipped
 *   - global / local scope is assigned based on zone purpose
 *   - getAutoModeFrameIds returns only frames tagged with autoModeVariationId
 *
 * Updated for Lane A (overnight push 2026-04-27): dropVariationOnCanvas now
 * places images INSIDE existing format frames via ensureFormatFrames.
 * The mock editor has been updated to include getShape and store.listen.
 */

import { describe, expect, it, vi } from 'vitest';
import { dropVariationOnCanvas, getAutoModeFrameIds } from '@/lib/auto-mode/canvas';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal tldraw Editor mock
// ──────────────────────────────────────────────────────────────────────────────

interface ShapeRecord {
  id: string;
  type: string;
  parentId?: string;
  x: number;
  y: number;
  props: Record<string, unknown>;
  meta: Record<string, unknown>;
}

interface AssetRecord {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

function makeMockEditor() {
  const shapes: ShapeRecord[] = [];
  const assets: AssetRecord[] = [];
  let selectedId: string | null = null;

  const editor = {
    getViewportPageBounds: vi.fn().mockReturnValue({ minX: 0, minY: 0, maxX: 1920, maxY: 1080 }),
    createShape: vi.fn((shape: Partial<ShapeRecord>) => {
      const full = {
        ...shape,
        props: (shape.props ?? {}) as Record<string, unknown>,
        meta: (shape.meta ?? {}) as Record<string, unknown>,
        x: shape.x ?? 0,
        y: shape.y ?? 0,
      } as ShapeRecord;
      shapes.push(full);
      return full.id;
    }),
    createAssets: vi.fn((newAssets: AssetRecord[]) => {
      assets.push(...newAssets);
    }),
    select: vi.fn((id: string) => { selectedId = id; }),
    zoomToSelection: vi.fn(),
    getCurrentPageShapes: vi.fn(() => shapes),
    // Lane A addition: getShape is required by dropVariationOnCanvas
    getShape: vi.fn((id: string) => shapes.find((s) => s.id === id) ?? undefined),
    updateShape: vi.fn(),
    store: {
      listen: vi.fn(() => () => {}),
    },
    _shapes: shapes,
    _assets: assets,
    _selectedId: () => selectedId,
  };
  return editor;
}

// We need to mock tldraw's createShapeId and AssetRecordType because they
// are imported as side-effects from the tldraw package. In the test
// environment we generate deterministic ids using a counter.
let _idCounter = 0;
vi.mock('tldraw', () => {
  return {
    createShapeId: vi.fn(() => `shape-${++_idCounter}`),
    AssetRecordType: {
      createId: vi.fn(() => `asset-${++_idCounter}`),
    },
  };
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeVariation(overrides: Partial<Parameters<typeof dropVariationOnCanvas>[0]['variation']> = {}) {
  return {
    id: 'var-1',
    index: 0,
    status: 'ready' as const,
    agentRunIds: [],
    startedAt: Date.now(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('dropVariationOnCanvas', () => {
  it('returns null when the variation has no image URL', () => {
    const editor = makeMockEditor();
    const result = dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation(),
    });
    expect(result).toBeNull();
    expect(editor.createShape).not.toHaveBeenCalled();
  });

  it('creates format frames + image shapes when heroImageUrl is provided', () => {
    const editor = makeMockEditor();
    const result = dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({ heroImageUrl: 'https://cdn.test/hero.png' }),
    });

    expect(result).not.toBeNull();

    // Should have created 4 format frames + 4 image shapes
    const frameShapes = editor._shapes.filter((s) => s.type === 'frame');
    expect(frameShapes.length).toBeGreaterThanOrEqual(4);

    const imageShapes = editor._shapes.filter((s) => s.type === 'image');
    expect(imageShapes.length).toBeGreaterThan(0);

    // At least one image shape should have a parentId (placed inside a frame)
    const imagesInFrames = imageShapes.filter((s) => s.parentId !== undefined);
    expect(imagesInFrames.length).toBeGreaterThan(0);

    expect(editor._assets.length).toBeGreaterThan(0);
    expect(editor._assets[0].props.src).toBe('https://cdn.test/hero.png');
  });

  it('prefers atlasUrl over heroImageUrl when both are present', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({
        heroImageUrl: 'https://cdn.test/hero.png',
        atlasUrl: 'https://cdn.test/atlas.png',
      }),
    });

    expect(editor._assets[0].props.src).toBe('https://cdn.test/atlas.png');
    expect(editor._assets[0].props.name).toMatch(/atlas/);
  });

  it('creates a geo overlay shape for each text overlay that has a bbox', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({
        heroImageUrl: 'https://cdn.test/hero.png',
        textOverlays: [
          {
            zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
            content: { 'en-SG': 'Buy now' },
            textAlign: 'center',
          },
          {
            zone: { purpose: 'body', bbox: { x: 0, y: 200, w: 512, h: 64 } },
            content: { 'en-SG': 'Great product' },
          },
        ],
      }),
    });

    const geoShapes = editor._shapes.filter((s) => s.type === 'geo');
    expect(geoShapes.length).toBe(2);

    // Verify the text content is stored in meta
    expect(geoShapes[0].meta.autoModeTextContent).toBe('Buy now');
    expect(geoShapes[1].meta.autoModeTextContent).toBe('Great product');
  });

  it('skips text overlays without a bbox', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({
        heroImageUrl: 'https://cdn.test/hero.png',
        textOverlays: [
          {
            zone: { purpose: 'headline' }, // no bbox
            content: { 'en-SG': 'Should be skipped' },
          },
          {
            zone: { purpose: 'cta', bbox: { x: 100, y: 500, w: 200, h: 50 } },
            content: { 'en-SG': 'Shop now' },
          },
        ],
      }),
    });

    const geoShapes = editor._shapes.filter((s) => s.type === 'geo');
    expect(geoShapes.length).toBe(1);
    expect(geoShapes[0].meta.autoModeTextContent).toBe('Shop now');
  });

  it('assigns global scope to headline and cta zones', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({
        heroImageUrl: 'https://cdn.test/hero.png',
        textOverlays: [
          {
            zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
            content: { 'en-SG': 'Big headline' },
          },
          {
            zone: { purpose: 'cta', bbox: { x: 0, y: 400, w: 200, h: 60 } },
            content: { 'en-SG': 'Learn more' },
          },
          {
            zone: { purpose: 'body', bbox: { x: 0, y: 200, w: 512, h: 100 } },
            content: { 'en-SG': 'Some body copy' },
          },
        ],
      }),
    });

    const geoShapes = editor._shapes.filter((s) => s.type === 'geo');
    const headlineShape = geoShapes.find((s) => s.meta.zone === 'headline');
    const ctaShape = geoShapes.find((s) => s.meta.zone === 'cta');
    const bodyShape = geoShapes.find((s) => s.meta.zone === 'body');

    expect(headlineShape?.meta.scope).toBe('global');
    expect(ctaShape?.meta.scope).toBe('global');
    expect(bodyShape?.meta.scope).toBe('local');
  });

  it('falls back to en-SG content then first available locale', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({
        heroImageUrl: 'https://cdn.test/hero.png',
        textOverlays: [
          {
            zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
            content: { 'zh-Hans-SG': '购买' }, // no en-SG entry
          },
        ],
      }),
      locale: 'ms-SG', // neither locale in content map
    });

    const geoShapes = editor._shapes.filter((s) => s.type === 'geo');
    // Falls back to first available: 'zh-Hans-SG'
    expect(geoShapes[0].meta.autoModeTextContent).toBe('购买');
  });

  it('calls zoomToSelection after dropping variation assets', () => {
    const editor = makeMockEditor();
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation: makeVariation({ heroImageUrl: 'https://cdn.test/hero.png' }),
    });
    expect(editor.zoomToSelection).toHaveBeenCalledWith({ animation: { duration: 300 } });
  });
});

describe('getAutoModeFrameIds', () => {
  it('returns ids of shapes with meta.autoModeVariationId set', () => {
    const editor = makeMockEditor();
    editor._shapes.push(
      {
        id: 'frame-auto-1',
        type: 'frame',
        x: 0,
        y: 0,
        props: {},
        meta: { autoModeVariationId: 'var-1' },
      },
      {
        id: 'frame-regular',
        type: 'frame',
        x: 0,
        y: 0,
        props: {},
        meta: {},
      },
      {
        id: 'image-auto',
        type: 'image',
        x: 0,
        y: 0,
        props: {},
        // images inside auto-mode frames are NOT frames themselves
        meta: { autoModeVariationId: 'var-1' },
      }
    );

    // getAutoModeFrameIds filters on type === 'frame' AND autoModeVariationId
    const ids = getAutoModeFrameIds(editor as unknown as import('tldraw').Editor);
    expect(ids).toEqual(['frame-auto-1']);
  });

  it('returns empty array when no auto-mode frames exist', () => {
    const editor = makeMockEditor();
    const ids = getAutoModeFrameIds(editor as unknown as import('tldraw').Editor);
    expect(ids).toEqual([]);
  });
});
