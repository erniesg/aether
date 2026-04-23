import type { Editor } from 'tldraw';
import { createShapeId } from 'tldraw';
import type { SafeZonePresetId } from './safeZones';

export interface ArtboardSeed {
  /** Label shown in tldraw's native frame header (editable by creators). */
  name: string;
  w: number;
  h: number;
  preset: SafeZonePresetId;
}

/**
 * Canonical dimensions for every supported artboard preset. Keyed by
 * `SafeZonePresetId` so the campaign picker can turn a `formats[]` list back
 * into `ArtboardSeed[]` without re-declaring sizes.
 */
export const ARTBOARD_PRESET_SEEDS: Readonly<Record<SafeZonePresetId, ArtboardSeed>> = {
  'ig-post': { name: 'IG Post · 1080×1350', w: 1080, h: 1350, preset: 'ig-post' },
  story: { name: 'Story · 1080×1920', w: 1080, h: 1920, preset: 'story' },
  'reel-cover': { name: 'Reel cover · 1080×1920', w: 1080, h: 1920, preset: 'reel-cover' },
  'linkedin-landscape': {
    name: 'LinkedIn · 1200×627',
    w: 1200,
    h: 627,
    preset: 'linkedin-landscape',
  },
};

export function presetIdsToSeeds(
  presets: ReadonlyArray<SafeZonePresetId>
): ArtboardSeed[] {
  return presets.map((id) => ARTBOARD_PRESET_SEEDS[id]);
}

/**
 * The four hero formats aether seeds on an empty workspace so the multiformat
 * promise is visible the moment the canvas loads. Anchored to the creator
 * platforms we optimise for; dimensions match each platform's current spec
 * sheet. Sizes drive tldraw's native frame shape directly — no custom shape.
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
];

const GAP_PX = 160;

/**
 * Seed `editor` with the given artboard frames, laid out left-to-right with
 * a small gap. Returns the created shape ids. Uses tldraw's native `frame`
 * shape — no custom shape classes, no bespoke render.
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
      meta: { aetherPreset: s.preset },
    });
    ids.push(id);
    cursorX += s.w + GAP_PX;
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

/**
 * Non-destructively align the page's artboards with a campaign's declared
 * `formats` list:
 *   - every declared format gets a frame (keep existing, append missing)
 *   - empty frames whose preset is NOT in the declared list are removed
 *   - frames that already hold user content (child shapes) are left alone
 *     regardless of whether they match the campaign — the pick is a
 *     non-destructive suggestion, not a wipe
 *
 * Returns the ids of frames newly created.
 */
export function reseedArtboardsForCampaign(
  editor: Editor,
  formats: ReadonlyArray<SafeZonePresetId>
): string[] {
  const pageShapes = editor.getCurrentPageShapes();
  const frames = pageShapes.filter((s) => s.type === 'frame');
  const childCount = new Map<string, number>();
  for (const shape of pageShapes) {
    const parentId = (shape as unknown as { parentId?: string }).parentId;
    if (!parentId) continue;
    childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
  }

  const kept = new Map<SafeZonePresetId, (typeof frames)[number]>();
  const obsolete: typeof frames = [];
  for (const frame of frames) {
    const preset = (frame.meta as Record<string, unknown> | undefined)?.aetherPreset as
      | SafeZonePresetId
      | undefined;
    if (preset && formats.includes(preset) && !kept.has(preset)) {
      kept.set(preset, frame);
      continue;
    }
    const hasChildren = (childCount.get(frame.id) ?? 0) > 0;
    if (!hasChildren) obsolete.push(frame);
  }
  if (obsolete.length > 0) {
    editor.deleteShapes(obsolete);
  }

  // Re-read after deletions so the x-layout picks up the correct rightmost edge.
  const survivors = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'frame');
  const rightmost = survivors.reduce((acc, s) => {
    const w = ((s as unknown as { props?: { w?: number } }).props?.w ?? 0);
    return Math.max(acc, s.x + w);
  }, 0);
  const missing = formats.filter((preset) => !kept.has(preset));
  const gap = 160;
  let cursorX = survivors.length > 0 ? rightmost + gap : 0;
  const createdIds: string[] = [];
  for (const preset of missing) {
    const seed = ARTBOARD_PRESET_SEEDS[preset];
    const id = createShapeId();
    editor.createShape({
      id,
      type: 'frame',
      x: cursorX,
      y: 0,
      props: { w: seed.w, h: seed.h, name: seed.name },
      meta: { aetherPreset: seed.preset },
    });
    createdIds.push(id);
    cursorX += seed.w + gap;
  }
  return createdIds;
}
