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
    for (let i = 0; i < DEFAULT_ARTBOARDS.length; i++) {
      const call = editor.createShape.mock.calls[i]![0];
      expect(call.type).toBe('frame');
      expect(call.props.w).toBe(DEFAULT_ARTBOARDS[i].w);
      expect(call.props.h).toBe(DEFAULT_ARTBOARDS[i].h);
      expect(call.props.name).toBe(DEFAULT_ARTBOARDS[i].name);
    }
  });

  it('lays frames out horizontally with a gap, no overlap on x axis', () => {
    const editor = makeEditor();
    seedArtboards(editor as never);
    const rects = editor.createShape.mock.calls.map((c) => ({
      x: c[0].x,
      w: c[0].props.w,
    }));
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w);
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
