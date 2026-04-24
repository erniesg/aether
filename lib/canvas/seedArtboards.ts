import type { Editor } from 'tldraw';
import { createShapeId } from 'tldraw';
import type { SafeZonePresetId } from './safeZones';
import {
  DEFAULT_LAYOUT_STRATEGY,
  layoutArtboards,
  type ArtboardLayoutStrategy,
} from './artboardLayout';

export interface ArtboardSeed {
  /** Label shown in tldraw's native frame header (editable by creators). */
  name: string;
  w: number;
  h: number;
  preset: SafeZonePresetId;
}

/**
 * The hero formats aether seeds on an empty workspace so the multiformat
 * promise is visible the moment the canvas loads. Anchored to the creator
 * platforms we optimise for; dimensions match each platform's current spec
 * sheet. Sizes drive tldraw's native frame shape directly — no custom shape.
 *
 * INVARIANT: every `preset` here must exist in SAFE_ZONE_PRESETS. Enforced
 * by `seedArtboards.test.ts` so the seeded set, the overlay, and the
 * composition-guidance layer can never drift out of sync.
 */
export const DEFAULT_ARTBOARDS: ReadonlyArray<ArtboardSeed> = [
  { name: 'IG Post · 1080×1350', w: 1080, h: 1350, preset: 'ig-post' },
  { name: 'Story · 1080×1920', w: 1080, h: 1920, preset: 'story' },
  { name: 'Reel cover · 1080×1920', w: 1080, h: 1920, preset: 'reel-cover' },
  {
    name: 'LinkedIn · 1200×627',
    w: 1200,
    h: 627,
    preset: 'linkedin-landscape',
  },
  { name: 'FB feed · 1200×630', w: 1200, h: 630, preset: 'fb-feed' },
  { name: 'X post · 1200×675', w: 1200, h: 675, preset: 'x-post' },
  { name: 'XHS · 1080×1440', w: 1080, h: 1440, preset: 'xhs-post' },
];

/**
 * Seed `editor` with the given artboard frames at positions determined by
 * the layout strategy. Returns the created shape ids. Uses tldraw's native
 * `frame` shape — no custom shape classes, no bespoke render.
 *
 * Defaults to the `orientation-groups` strategy so the seven presets don't
 * unroll into a single 8500-px-wide strip on first load.
 */
export function seedArtboards(
  editor: Editor,
  seeds: ReadonlyArray<ArtboardSeed> = DEFAULT_ARTBOARDS,
  strategy: ArtboardLayoutStrategy = DEFAULT_LAYOUT_STRATEGY
): string[] {
  const placements = layoutArtboards(seeds, strategy);
  const ids: string[] = [];
  for (const p of placements) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: 'frame',
      x: p.x,
      y: p.y,
      props: { w: p.seed.w, h: p.seed.h, name: p.seed.name },
      meta: { aetherPreset: p.seed.preset },
    });
    ids.push(id);
  }
  return ids;
}

/**
 * Seed only if the current page has no shapes. Frames the creator on the
 * seeded content so the workspace opens with all four artboards visible,
 * then releases the selection so the creator doesn't inherit a group select.
 */
export function maybeSeedArtboards(editor: Editor): string[] {
  const existing = editor.getCurrentPageShapes();
  if (existing.length > 0) return [];

  const ids = seedArtboards(editor);
  if (ids.length === 0) return ids;

  try {
    editor.selectAll();
    editor.zoomToSelection({ animation: { duration: 240 } });
    editor.setSelectedShapes([]);
  } catch {
    // best-effort framing; never throw out of a mount hook
  }
  return ids;
}
