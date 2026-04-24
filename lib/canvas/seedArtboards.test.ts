import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ARTBOARDS, maybeSeedArtboards, seedArtboards } from './seedArtboards';
import {
  SAFE_ZONE_PRESETS,
  resolveSafeZonePresetId,
} from './safeZones';
import { buildCompositionGuidance } from '@/lib/providers/image/guidance';

type MockEditor = {
  createShape: ReturnType<typeof vi.fn>;
  getCurrentPageShapes: ReturnType<typeof vi.fn>;
  selectAll: ReturnType<typeof vi.fn>;
  zoomToSelection: ReturnType<typeof vi.fn>;
  setSelectedShapes: ReturnType<typeof vi.fn>;
};

function makeEditor(shapeCount = 0): MockEditor {
  return {
    createShape: vi.fn(),
    getCurrentPageShapes: vi.fn(() => new Array(shapeCount)),
    selectAll: vi.fn(),
    zoomToSelection: vi.fn(),
    setSelectedShapes: vi.fn(),
  };
}

describe('seedArtboards · reuses tldraw native frame shapes', () => {
  it('creates one frame per seed with tldraw type "frame" and a name prop', () => {
    const editor = makeEditor();
    const ids = seedArtboards(editor as never);

    expect(ids).toHaveLength(DEFAULT_ARTBOARDS.length);
    expect(editor.createShape).toHaveBeenCalledTimes(DEFAULT_ARTBOARDS.length);
    // Order depends on the layout strategy, so verify by set equality:
    // every seed must have exactly one matching createShape call.
    const calls = editor.createShape.mock.calls.map((c) => c[0]);
    for (const seed of DEFAULT_ARTBOARDS) {
      const match = calls.find(
        (c) =>
          c.type === 'frame' &&
          c.props.w === seed.w &&
          c.props.h === seed.h &&
          c.props.name === seed.name
      );
      expect(match).toBeDefined();
    }
  });

  it('lays frames out without horizontal overlap within each row', () => {
    const editor = makeEditor();
    seedArtboards(editor as never);
    const rects = editor.createShape.mock.calls.map((c) => ({
      x: c[0].x,
      y: c[0].y,
      w: c[0].props.w,
    }));
    const byRow = new Map<number, typeof rects>();
    for (const r of rects) {
      const row = byRow.get(r.y) ?? [];
      row.push(r);
      byRow.set(r.y, row);
    }
    for (const row of byRow.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
      }
    }
  });

  it('respects the row strategy (single-row, strict x order)', () => {
    const editor = makeEditor();
    seedArtboards(editor as never, undefined, 'row');
    const shapes = editor.createShape.mock.calls.map((c) => c[0]);
    for (const s of shapes) expect(s.y).toBe(0);
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].x).toBeGreaterThan(shapes[i - 1].x);
    }
  });

  it('maybeSeedArtboards skips seeding when the page already has shapes', () => {
    const editor = makeEditor(3);
    const ids = maybeSeedArtboards(editor as never);
    expect(ids).toEqual([]);
    expect(editor.createShape).not.toHaveBeenCalled();
  });

  it('maybeSeedArtboards seeds + zooms when the page is empty', () => {
    const editor = makeEditor(0);
    const ids = maybeSeedArtboards(editor as never);
    expect(ids.length).toBe(DEFAULT_ARTBOARDS.length);
    expect(editor.createShape).toHaveBeenCalledTimes(DEFAULT_ARTBOARDS.length);
    expect(editor.selectAll).toHaveBeenCalledTimes(1);
    expect(editor.zoomToSelection).toHaveBeenCalledTimes(1);
    // Release selection so creators don't inherit the seeded selection.
    expect(editor.setSelectedShapes).toHaveBeenCalledWith([]);
  });

  it('default seeds cover the seven hero formats the demo ships with', () => {
    const labels = DEFAULT_ARTBOARDS.map((a) => a.name.toLowerCase());
    expect(labels.join(' ')).toMatch(/ig post/);
    expect(labels.join(' ')).toMatch(/story/);
    expect(labels.join(' ')).toMatch(/reel/);
    expect(labels.join(' ')).toMatch(/linkedin/);
    expect(labels.join(' ')).toMatch(/fb/);
    expect(labels.join(' ')).toMatch(/x post/);
    expect(labels.join(' ')).toMatch(/xhs/);
  });
});

describe('seedArtboards · consistency with safe-zone + guidance layers', () => {
  it('every seeded artboard points at a real SafeZonePreset', () => {
    for (const seed of DEFAULT_ARTBOARDS) {
      expect(SAFE_ZONE_PRESETS[seed.preset]).toBeDefined();
      expect(SAFE_ZONE_PRESETS[seed.preset].id).toBe(seed.preset);
    }
  });

  it('each seeded artboard name resolves back to its preset via the overlay resolver', () => {
    for (const seed of DEFAULT_ARTBOARDS) {
      const resolved = resolveSafeZonePresetId({
        props: { name: seed.name, w: seed.w, h: seed.h },
      });
      expect(resolved).toBe(seed.preset);
    }
  });

  it('buildCompositionGuidance tolerates every seeded preset', () => {
    for (const seed of DEFAULT_ARTBOARDS) {
      const g = buildCompositionGuidance({ preset: seed.preset });
      // Kind 'none' presets return empty; others must describe something.
      const spec = SAFE_ZONE_PRESETS[seed.preset];
      if (spec.kind === 'none') {
        expect(g.promptSuffix).toBe('');
      } else {
        expect(g.promptSuffix.length).toBeGreaterThan(0);
      }
    }
  });
});
