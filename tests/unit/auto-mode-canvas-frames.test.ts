/**
 * Lane A — failing tests for frame-aware variation drop (RED phase).
 *
 * Tests the new behavior introduced in the overnight push:
 *   1. dropVariationOnCanvas places per-format heroes INTO existing canvas
 *      format frames (matched by aspect ratio), not as new floating frames.
 *   2. ensureFormatFrames creates the 4 standard SG format frames once;
 *      subsequent calls return the same ids without creating duplicates.
 *   3. Text overlays carry meta.variationId, meta.locale, meta.format,
 *      meta.role, and meta.scope ('global' | 'local').
 *   4. buildGlobalTextPropagator returns a store-listener that fans out
 *      global-scoped text edits to sibling shapes.
 *
 * Mock strategy: minimal in-memory editor stand-in (same pattern as the
 * existing auto-mode-canvas.test.ts) plus a lightweight store.listen mock.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  dropVariationOnCanvas,
  ensureFormatFrames,
  FORMAT_FRAME_SPECS,
  buildGlobalTextPropagator,
  getAutoModeFrameIds,
} from '@/lib/auto-mode/canvas';

// ──────────────────────────────────────────────────────────────────────────────
// Shared counter so shape ids are unique across tests
// ──────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

vi.mock('tldraw', () => ({
  createShapeId: vi.fn(() => `shape-${++_idCounter}`),
  AssetRecordType: {
    createId: vi.fn(() => `asset-${++_idCounter}`),
  },
}));

beforeEach(() => {
  _idCounter = 0;
});

// ──────────────────────────────────────────────────────────────────────────────
// Minimal editor mock with store.listen support
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

type StoreListener = (changes: {
  changes: {
    updated: Record<string, [ShapeRecord, ShapeRecord]>;
  };
}) => void;

function makeMockEditor(preloadedShapes: ShapeRecord[] = []) {
  const shapes: ShapeRecord[] = [...preloadedShapes];
  const assets: AssetRecord[] = [];
  const listeners: StoreListener[] = [];
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
    select: vi.fn((id: string) => {
      selectedId = id;
    }),
    zoomToSelection: vi.fn(),
    zoomToFit: vi.fn(),
    getCurrentPageShapes: vi.fn(() => shapes),
    getShape: vi.fn((id: string) => shapes.find((s) => s.id === id) ?? undefined),
    updateShape: vi.fn((update: Partial<ShapeRecord> & { id: string }) => {
      const idx = shapes.findIndex((s) => s.id === update.id);
      if (idx >= 0) {
        const old = shapes[idx];
        shapes[idx] = { ...old, ...update } as ShapeRecord;
        // Fire listeners as if store updated
        const changes: Record<string, [ShapeRecord, ShapeRecord]> = {
          [update.id]: [old, shapes[idx]],
        };
        for (const l of listeners) {
          l({ changes: { updated: changes } } as Parameters<StoreListener>[0]);
        }
      }
    }),
    reparentShapes: vi.fn(),
    store: {
      listen: vi.fn((cb: StoreListener) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      }),
    },
    _shapes: shapes,
    _assets: assets,
    _selectedId: () => selectedId,
    _listeners: listeners,
    // Helper: simulate a text shape update from the user
    _simulateTextEdit: (shapeId: string, newText: string) => {
      const idx = shapes.findIndex((s) => s.id === shapeId);
      if (idx < 0) return;
      const old = { ...shapes[idx] };
      shapes[idx] = {
        ...shapes[idx],
        props: { ...shapes[idx].props, text: newText },
      } as ShapeRecord;
      const changes: Record<string, [ShapeRecord, ShapeRecord]> = {
        [shapeId]: [old, shapes[idx]],
      };
      for (const l of listeners) {
        l({ changes: { updated: changes } } as Parameters<StoreListener>[0]);
      }
    },
  };
  return editor;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeVariation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    index: 0,
    status: 'ready' as const,
    agentRunIds: [],
    startedAt: Date.now(),
    heroImageUrl: 'https://cdn.test/hero.png',
    ...overrides,
  };
}

function makeFormatFrames(): ShapeRecord[] {
  return FORMAT_FRAME_SPECS.map((spec, i) => ({
    id: `format-frame-${i}`,
    type: 'frame',
    x: i * (spec.w + 160),
    y: 0,
    props: { w: spec.w, h: spec.h, name: spec.name },
    meta: {
      aetherFormatFrame: true,
      aspect: spec.aspect,
      format: spec.formatId,
    },
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// ensureFormatFrames
// ──────────────────────────────────────────────────────────────────────────────

describe('ensureFormatFrames', () => {
  it('creates exactly 4 standard format frames when canvas is empty', () => {
    const editor = makeMockEditor();
    const ids = ensureFormatFrames(editor as unknown as import('tldraw').Editor);
    expect(ids).toHaveLength(4);
    const frames = editor._shapes.filter((s) => s.type === 'frame');
    expect(frames).toHaveLength(4);
  });

  it('tags created frames with meta.aetherFormatFrame and meta.aspect', () => {
    const editor = makeMockEditor();
    ensureFormatFrames(editor as unknown as import('tldraw').Editor);
    const frames = editor._shapes.filter((s) => s.type === 'frame');
    for (const f of frames) {
      expect(f.meta.aetherFormatFrame).toBe(true);
      expect(typeof f.meta.aspect).toBe('string');
      expect(typeof f.meta.formatId).toBe('string');
    }
  });

  it('does NOT create new frames when all 4 format frames already exist', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const ids = ensureFormatFrames(editor as unknown as import('tldraw').Editor);
    // Should return existing ids, not create new shapes
    expect(editor.createShape).not.toHaveBeenCalled();
    expect(ids).toHaveLength(4);
  });

  it('creates only missing format frames when some are present', () => {
    // Pre-load 2 of the 4 frames
    const preloaded = makeFormatFrames().slice(0, 2);
    const editor = makeMockEditor(preloaded);
    ensureFormatFrames(editor as unknown as import('tldraw').Editor);
    // Should have created 2 more (not 4)
    expect(editor.createShape).toHaveBeenCalledTimes(2);
    const frames = editor._shapes.filter((s) => s.type === 'frame');
    expect(frames).toHaveLength(4);
  });

  it('FORMAT_FRAME_SPECS has 4 entries covering 1:1, 4:5, 9:16, 16:9', () => {
    const aspects = FORMAT_FRAME_SPECS.map((s) => s.aspect);
    expect(aspects).toContain('1:1');
    expect(aspects).toContain('4:5');
    expect(aspects).toContain('9:16');
    expect(aspects).toContain('16:9');
    expect(FORMAT_FRAME_SPECS).toHaveLength(4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// dropVariationOnCanvas — frame placement
// ──────────────────────────────────────────────────────────────────────────────

describe('dropVariationOnCanvas — places images inside existing format frames', () => {
  it('places the hero image inside a matching format frame (1:1)', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);

    const variation = makeVariation({
      // Variation provides native renders for 1:1 only
      nativePerFormatRendered: [],
    });
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    // An image shape should have a parentId equal to the 1:1 format frame id
    const squareFrame = preloaded.find((f) => f.meta.aspect === '1:1');
    expect(squareFrame).toBeDefined();

    const imageInSquare = editor._shapes.find(
      (s) => s.type === 'image' && s.parentId === squareFrame!.id
    );
    expect(imageInSquare).toBeDefined();
  });

  it('does NOT create new floating frames when format frames already exist', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const variation = makeVariation();
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    // No new frame shapes should be created
    const framesBefore = preloaded.length;
    const framesAfter = editor._shapes.filter((s) => s.type === 'frame').length;
    expect(framesAfter).toBe(framesBefore);
  });

  it('creates format frames if none exist, then drops image inside', () => {
    const editor = makeMockEditor();
    const variation = makeVariation();
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    // 4 format frames should have been created
    const frames = editor._shapes.filter((s) => s.type === 'frame');
    expect(frames.length).toBeGreaterThanOrEqual(4);

    // At least one image shape should exist with a parentId pointing to a frame
    const images = editor._shapes.filter(
      (s) => s.type === 'image' && s.parentId !== undefined
    );
    expect(images.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// dropVariationOnCanvas — text overlay meta fields
// ──────────────────────────────────────────────────────────────────────────────

describe('dropVariationOnCanvas — text overlay meta enrichment', () => {
  it('sets meta.variationId on text overlay shapes', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const variation = makeVariation({
      id: 'var-99',
      textOverlays: [
        {
          zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
          content: { 'en-SG': 'Sleep deeper' },
        },
      ],
    });
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    const overlays = editor._shapes.filter(
      (s) => s.type === 'geo' && s.meta.autoModeTextOverlay
    );
    expect(overlays.length).toBeGreaterThan(0);
    for (const o of overlays) {
      expect(o.meta.variationId).toBe('var-99');
    }
  });

  it('sets meta.locale on text overlay shapes', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const variation = makeVariation({
      textOverlays: [
        {
          zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
          content: { 'en-SG': 'Sleep deeper' },
        },
      ],
    });
    dropVariationOnCanvas({
      editor: editor as unknown as import('tldraw').Editor,
      variation,
      locale: 'en-SG',
    });

    const overlays = editor._shapes.filter(
      (s) => s.type === 'geo' && s.meta.autoModeTextOverlay
    );
    for (const o of overlays) {
      expect(o.meta.locale).toBe('en-SG');
    }
  });

  it('sets meta.role to the zone purpose', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const variation = makeVariation({
      textOverlays: [
        {
          zone: { purpose: 'cta', bbox: { x: 0, y: 500, w: 200, h: 60 } },
          content: { 'en-SG': 'Shop now' },
        },
      ],
    });
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    const ctaOverlay = editor._shapes.find(
      (s) => s.type === 'geo' && s.meta.role === 'cta'
    );
    expect(ctaOverlay).toBeDefined();
  });

  it('sets meta.format to the parent frame formatId', () => {
    const preloaded = makeFormatFrames();
    const editor = makeMockEditor(preloaded);
    const variation = makeVariation({
      textOverlays: [
        {
          zone: { purpose: 'headline', bbox: { x: 0, y: 0, w: 512, h: 128 } },
          content: { 'en-SG': 'Sleep deeper' },
        },
      ],
    });
    dropVariationOnCanvas({ editor: editor as unknown as import('tldraw').Editor, variation });

    const overlays = editor._shapes.filter(
      (s) => s.type === 'geo' && s.meta.autoModeTextOverlay
    );
    for (const o of overlays) {
      expect(typeof o.meta.format).toBe('string');
      expect((o.meta.format as string).length).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildGlobalTextPropagator
// ──────────────────────────────────────────────────────────────────────────────

describe('buildGlobalTextPropagator', () => {
  it('exports a function that takes an editor and returns an unsubscribe fn', () => {
    const editor = makeMockEditor();
    const unsubscribe = buildGlobalTextPropagator(
      editor as unknown as import('tldraw').Editor,
      async () => {} // stub Convex mutation
    );
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('does NOT fan out changes for local-scoped text shapes', () => {
    const siblingId = `shape-sibling`;
    const preloaded: ShapeRecord[] = [
      {
        id: 'text-local',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'original' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'local',
          variationId: 'var-1',
          zone: 'headline',
          locale: 'en-SG',
          format: '1:1',
          role: 'headline',
          autoModeTextContent: 'original',
        },
      },
      {
        id: siblingId,
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'original' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'global',
          variationId: 'var-1',
          zone: 'headline',
          locale: 'zh-Hans-SG',
          format: '9:16',
          role: 'headline',
          autoModeTextContent: 'original',
        },
      },
    ];
    const editor = makeMockEditor(preloaded);
    const mutationSpy = vi.fn().mockResolvedValue(undefined);
    buildGlobalTextPropagator(editor as unknown as import('tldraw').Editor, mutationSpy);

    // Simulate user editing the LOCAL shape
    editor._simulateTextEdit('text-local', 'changed');

    // Sibling shape should be unchanged
    const sibling = editor._shapes.find((s) => s.id === siblingId);
    expect(sibling?.props.text).toBe('original');
    expect(mutationSpy).not.toHaveBeenCalled();
  });

  it('fans out changes for global-scoped text shapes to all siblings of same variation+role', () => {
    const preloaded: ShapeRecord[] = [
      {
        id: 'text-global-en',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'original', label: 'original', labelColor: 'white' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'global',
          variationId: 'var-1',
          zone: 'headline',
          locale: 'en-SG',
          format: '1:1',
          role: 'headline',
          autoModeTextContent: 'original',
        },
      },
      {
        id: 'text-global-zh',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: '原版', label: '原版', labelColor: 'white' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'global',
          variationId: 'var-1',
          zone: 'headline',
          locale: 'zh-Hans-SG',
          format: '9:16',
          role: 'headline',
          autoModeTextContent: '原版',
        },
      },
      {
        id: 'text-different-variation',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'other var' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'global',
          variationId: 'var-2',
          zone: 'headline',
          locale: 'en-SG',
          format: '1:1',
          role: 'headline',
          autoModeTextContent: 'other var',
        },
      },
    ];
    const editor = makeMockEditor(preloaded);
    const mutationSpy = vi.fn().mockResolvedValue(undefined);
    buildGlobalTextPropagator(editor as unknown as import('tldraw').Editor, mutationSpy);

    // Simulate user editing the en-SG global shape
    editor._simulateTextEdit('text-global-en', 'new headline');

    // zh-Hans-SG sibling (same variation + role) should be updated
    const zhSibling = editor._shapes.find((s) => s.id === 'text-global-zh');
    expect(zhSibling?.props.text).toBe('new headline');

    // Different variation should not be affected
    const otherVar = editor._shapes.find((s) => s.id === 'text-different-variation');
    expect(otherVar?.props.text).toBe('other var');
  });

  it('calls the Convex mutation on global text change', async () => {
    const preloaded: ShapeRecord[] = [
      {
        id: 'text-global-en',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'original', label: 'original', labelColor: 'white' },
        meta: {
          autoModeTextOverlay: true,
          scope: 'global',
          variationId: 'var-1',
          zone: 'headline',
          locale: 'en-SG',
          format: '1:1',
          role: 'headline',
          autoModeTextContent: 'original',
        },
      },
    ];
    const editor = makeMockEditor(preloaded);
    const mutationSpy = vi.fn().mockResolvedValue(undefined);
    buildGlobalTextPropagator(editor as unknown as import('tldraw').Editor, mutationSpy);

    editor._simulateTextEdit('text-global-en', 'updated copy');

    // Allow microtask queue to flush (mutation is async)
    await Promise.resolve();

    expect(mutationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variationId: 'var-1',
        locale: 'en-SG',
        format: '1:1',
        scope: 'global',
        role: 'headline',
        text: 'updated copy',
      })
    );
  });

  it('does not propagate when the changed shape is not a text overlay', () => {
    const editor = makeMockEditor([
      {
        id: 'regular-shape',
        type: 'geo',
        x: 0,
        y: 0,
        props: { text: 'hi' },
        meta: {},
      },
    ]);
    const mutationSpy = vi.fn().mockResolvedValue(undefined);
    buildGlobalTextPropagator(editor as unknown as import('tldraw').Editor, mutationSpy);
    editor._simulateTextEdit('regular-shape', 'changed');
    expect(mutationSpy).not.toHaveBeenCalled();
  });
});
