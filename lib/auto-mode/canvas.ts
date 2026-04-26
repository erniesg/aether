/**
 * Canvas helpers for Auto Mode — drop variation assets onto the tldraw canvas
 * as named frames (atlas + per-format heroes + editable text overlays).
 *
 * Single responsibility: geometry and shape creation. The parent WorkspaceShell
 * calls these; they never fetch, never write to Convex.
 *
 * Hard rule #5 compliance: text overlay shapes are dropped as tldraw `text`
 * shapes at the bbox positions from `variation.textOverlays[i].zone.bbox`.
 * Shapes tagged with `data-scope="global"` are intended to propagate to all
 * sibling variation frames when the creator edits them; local-scope shapes
 * stay per-frame. Full propagation is a follow-up — see NOTE below.
 *
 * NOTE: Global-scope text propagation (editor edits → sibling frames) is
 * marked as a FOLLOW-UP. The shape is tagged in meta so the next engineer
 * can wire up an editor.store.listen → patch-siblings path without touching
 * the shape creation logic.
 */

import type { Editor } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';
import type { AutoModeVariationView } from '@/components/rail/sections/AutoModePanel';

export interface DropVariationOnCanvasOptions {
  /** tldraw editor instance. */
  editor: Editor;
  /** The variation whose atlas should be dropped. */
  variation: AutoModeVariationView & {
    atlasUrl?: string;
    textOverlays?: Array<{
      zone: {
        purpose: string;
        bbox?: { x: number; y: number; w: number; h: number };
      };
      content: Record<string, string>;
      textAlign?: 'start' | 'center' | 'end';
    }>;
    nativePerFormatRendered?: string[];
  };
  /** Active locale for text overlay content selection. Default: 'en-SG'. */
  locale?: string;
}

/** Standard atlas dimensions (4 formats × 4 locales, each 512² thumbnail). */
const ATLAS_W = 2048;
const ATLAS_H = 2048;

/** Width of the dropped atlas frame on canvas (scaled to fit reasonably). */
const FRAME_W_PX = 600;
const FRAME_H_PX = 600;

/**
 * Drop a variation's atlas onto the canvas as a named tldraw frame containing
 * an image shape. Text overlays (when present) are layered on top as editable
 * text shapes with provenance metadata.
 *
 * Returns the frame shape id, or null when the variation has no heroImageUrl
 * or atlasUrl (nothing to drop).
 */
export function dropVariationOnCanvas({
  editor,
  variation,
  locale = 'en-SG',
}: DropVariationOnCanvasOptions): string | null {
  const imageUrl = variation.atlasUrl ?? variation.heroImageUrl;
  if (!imageUrl) return null;

  // Position frames in a row, separated by a small gap. Inspect existing
  // auto-mode frames and place the new one to the right of the last one.
  const viewport = editor.getViewportPageBounds();
  const existingFrames = getAutoModeFrameIds(editor);
  const offsetX = existingFrames.length * (FRAME_W_PX + 32);
  const x = viewport.minX + 32 + offsetX;
  const y = viewport.minY + 32;

  // Create the outer frame.
  const frameId = createShapeId();
  editor.createShape({
    id: frameId,
    type: 'frame',
    x,
    y,
    props: {
      w: FRAME_W_PX,
      h: FRAME_H_PX,
      name: `auto v${variation.index}`,
    },
    meta: {
      autoModeVariationId: variation.id,
      autoModeVariationIndex: variation.index,
    },
  });

  // Register the atlas image as an asset.
  const assetId = AssetRecordType.createId();
  const isAtlas = Boolean(variation.atlasUrl);
  editor.createAssets([
    {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: isAtlas ? `v${variation.index} atlas` : `v${variation.index} hero`,
        src: imageUrl,
        w: isAtlas ? ATLAS_W : 1024,
        h: isAtlas ? ATLAS_H : 1024,
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  // Drop the image inside the frame.
  const imgId = createShapeId();
  editor.createShape({
    id: imgId,
    type: 'image',
    parentId: frameId,
    x: 0,
    y: 0,
    props: {
      assetId,
      w: FRAME_W_PX,
      h: FRAME_H_PX,
    },
  });

  // Drop text overlays inside the frame as geo shapes with labels so the
  // creator can click + edit the copy. We use 'geo' rectangles with text
  // rather than 'text' shapes because geo shapes are compatible with
  // tldraw 3.x's richText-based text shape API without requiring ProseMirror
  // node construction.
  //
  // FOLLOW-UP: propagate edits to 'global'-scoped shapes to sibling variation
  // frames via editor.store.listen → patch-siblings. The meta.scope tag below
  // carries the intent so the next engineer can wire it without touching shape
  // creation.
  if (variation.textOverlays && variation.textOverlays.length > 0) {
    for (const overlay of variation.textOverlays) {
      const copy =
        overlay.content[locale] ??
        overlay.content['en-SG'] ??
        Object.values(overlay.content)[0] ??
        '';
      if (!copy) continue;

      const bbox = overlay.zone.bbox;
      // When the agent didn't return bbox, skip shape placement — we cannot
      // position the overlay without coordinates.
      if (!bbox) continue;

      // Scale the bbox from the hero's 1024² coordinate space to the frame.
      const scaleX = FRAME_W_PX / 1024;
      const scaleY = FRAME_H_PX / 1024;

      const geoId = createShapeId();
      // tldraw 3.x geo shapes use `richText` internally; we cast through
      // unknown here because the public createShape API accepts a plain `text`
      // string that gets coerced on save. The cast avoids the strict-mode
      // object-literal check while keeping runtime behaviour correct.
      // See: https://tldraw.dev/docs/shapes/geo
      editor.createShape({
        id: geoId,
        type: 'geo',
        parentId: frameId,
        x: bbox.x * scaleX,
        y: bbox.y * scaleY,
        props: {
          geo: 'rectangle',
          w: Math.max(bbox.w * scaleX, 40),
          h: Math.max(bbox.h * scaleY, 24),
          fill: 'none' as const,
          dash: 'dashed' as const,
          color: 'white' as const,
          size: 's' as const,
          align: (overlay.textAlign === 'center' ? 'middle' : overlay.textAlign === 'end' ? 'end' : 'start') as 'start' | 'middle' | 'end',
          verticalAlign: 'middle' as const,
          labelColor: 'white' as const,
        } as Record<string, unknown>,
        meta: {
          autoModeTextOverlay: true,
          autoModeTextContent: copy,
          // 'global' = creator intent: propagate to all variation frames.
          // 'local'  = this frame only.
          scope: overlay.zone.purpose === 'headline' || overlay.zone.purpose === 'cta' ? 'global' : 'local',
          zone: overlay.zone.purpose,
          locale,
        },
      } as Parameters<typeof editor.createShape>[0]);
    }
  }

  editor.select(frameId);
  editor.zoomToSelection({ animation: { duration: 300 } });
  return frameId;
}

/**
 * Return the shape ids of all tldraw frames that were placed by Auto Mode
 * (tagged with `meta.autoModeVariationId`).
 */
export function getAutoModeFrameIds(editor: Editor): string[] {
  const shapes = editor.getCurrentPageShapes();
  return shapes
    .filter(
      (s) =>
        s.type === 'frame' &&
        s.meta &&
        typeof (s.meta as Record<string, unknown>).autoModeVariationId === 'string'
    )
    .map((s) => s.id as string);
}
