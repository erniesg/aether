import type { Editor } from 'tldraw';
import { createShapeId } from 'tldraw';
import type { SafeZonePresetId } from './safeZones';

/**
 * One source of truth for the four hero posting formats. The values match
 * `FORMAT_FRAME_SPECS` in lib/auto-mode/canvas.ts intentionally — both modules
 * write the same `meta.aetherFormatFrame=true / formatId / aspect` keys so
 * ensureFormatFrames() finds and REUSES seeded frames instead of stacking a
 * second set on top of them at x=0. Drift here re-introduces the frame-doubling
 * bug we hit on 2026-04-27.
 */
export interface ArtboardSeed {
  /** Label shown in tldraw's native frame header (editable by creators). */
  name: string;
  w: number;
  h: number;
  /** Stable id used by auto-mode to look up the matching frame. */
  formatId: '1x1' | '4x5' | '9x16' | '16x9';
  /** W:H string used by ensureFormatFrames as a secondary dedup key. */
  aspect: '1:1' | '4:5' | '9:16' | '16:9';
  /** Optional safe-zone preset for frames where Meta / LinkedIn publish a spec. */
  preset?: SafeZonePresetId;
}

/**
 * The four hero formats aether seeds on an empty workspace so the multiformat
 * promise is visible the moment the canvas loads. Anchored to the creator
 * platforms we optimise for; dimensions match each platform's current spec
 * sheet. Sizes drive tldraw's native frame shape directly — no custom shape.
 *
 * Aligned with FORMAT_FRAME_SPECS (lib/auto-mode/canvas.ts) so a fresh
 * workspace and a campaign drop see THE SAME four frames. Without this
 * alignment, ensureFormatFrames() created a second set at x=0, overlapping
 * the seeded set — visible to the user as "wrong aspect ratios".
 */
export const DEFAULT_ARTBOARDS: ReadonlyArray<ArtboardSeed> = [
  { name: 'IG Square · 1080×1080',   w: 1080, h: 1080, formatId: '1x1',  aspect: '1:1'  },
  { name: 'IG Post · 1080×1350',     w: 1080, h: 1350, formatId: '4x5',  aspect: '4:5',  preset: 'ig-post' },
  { name: 'Story / Reel · 1080×1920', w: 1080, h: 1920, formatId: '9x16', aspect: '9:16', preset: 'story' },
  { name: 'LinkedIn · 1920×1080',    w: 1920, h: 1080, formatId: '16x9', aspect: '16:9' },
];

const GAP_PX = 160;

/**
 * Seed `editor` with the given artboard frames, laid out left-to-right with
 * a small gap. Returns the created shape ids. Uses tldraw's native `frame`
 * shape — no custom shape classes, no bespoke render. Each frame carries
 * `aetherFormatFrame=true / formatId / aspect` so auto-mode's
 * ensureFormatFrames() reuses these frames instead of creating duplicates.
 */
export function seedArtboards(
  editor: Editor,
  seeds: ReadonlyArray<ArtboardSeed> = DEFAULT_ARTBOARDS
): string[] {
  const ids: string[] = [];
  let cursorX = 0;
  for (const s of seeds) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: 'frame',
      x: cursorX,
      y: 0,
      props: { w: s.w, h: s.h, name: s.name },
      meta: {
        aetherFormatFrame: true,
        formatId: s.formatId,
        aspect: s.aspect,
        ...(s.preset ? { aetherPreset: s.preset } : {}),
      },
    });
    ids.push(id);
    cursorX += s.w + GAP_PX;
  }
  return ids;
}

/**
 * Seed if the current page has no frame shapes. Frames the creator on the
 * seeded content so the workspace opens with all four artboards visible,
 * then releases the selection so the creator doesn't inherit a group select.
 *
 * We seed when *frames* are missing rather than when the page is empty so a
 * creator who deleted them recovers the multiformat surface on next mount.
 * Other shapes (refs, generated images, sketches) are preserved.
 */
export function maybeSeedArtboards(editor: Editor): string[] {
  const existingFrames = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === 'frame');
  if (existingFrames.length > 0) return [];

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
