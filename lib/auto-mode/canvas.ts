/**
 * Canvas helpers for Auto Mode — drop variation assets onto the tldraw canvas
 * as named frames (atlas + per-format heroes + editable text overlays).
 *
 * Single responsibility: geometry and shape creation. The parent WorkspaceShell
 * calls these; they never fetch, never write to Convex directly. The Convex
 * mutation callback is passed in from the shell to keep this module
 * dependency-free.
 *
 * Hard rule #5 compliance: text overlay shapes are dropped as tldraw `text`
 * shapes at the bbox positions from `variation.textOverlays[i].zone.bbox`.
 * Shapes tagged with `meta.scope='global'` propagate to all sibling text
 * shapes for that variation when the creator edits them (wired via
 * buildGlobalTextPropagator). `'local'` edits stay per-frame.
 *
 * Lane A (overnight push 2026-04-27):
 *   - ensureFormatFrames: create/reuse the 4 standard SG format frames.
 *   - FORMAT_FRAME_SPECS: 4-entry spec array (1:1, 4:5, 9:16, 16:9).
 *   - dropVariationOnCanvas: place per-format heroes INSIDE existing frames.
 *   - buildGlobalTextPropagator: editor.store.listen → fan-out global edits.
 *   - updateVariationOverlay Convex mutation callback is called on each edit.
 */

import type { Editor } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';
import type { AutoModeVariationView } from '@/components/rail/sections/AutoModePanel';

// ──────────────────────────────────────────────────────────────────────────────
// Standard SG format frame specs
// ──────────────────────────────────────────────────────────────────────────────

export interface FormatFrameSpec {
  formatId: string;
  name: string;
  w: number;
  h: number;
  aspect: string;
}

/**
 * The four standard SG posting formats. One frame per entry is seeded onto
 * the canvas when auto-mode fires (if not already present). Variations drop
 * their per-format heroes INTO these frames — the user always sees a clean
 * multiformat grid, never floating "auto v1" stragglers.
 *
 * Dimensions match platform specs:
 *   1:1  → IG Feed post (1080×1080)
 *   4:5  → IG Portrait (1080×1350)
 *   9:16 → Reel / Story (1080×1920)
 *   16:9 → LinkedIn / YouTube Shorts landscape (1920×1080)
 */
export const FORMAT_FRAME_SPECS: ReadonlyArray<FormatFrameSpec> = [
  { formatId: '1x1',  name: 'IG Square · 1080×1080',  w: 1080, h: 1080, aspect: '1:1'  },
  { formatId: '4x5',  name: 'IG Portrait · 1080×1350', w: 1080, h: 1350, aspect: '4:5'  },
  { formatId: '9x16', name: 'Reel · 1080×1920',        w: 1080, h: 1920, aspect: '9:16' },
  { formatId: '16x9', name: 'LinkedIn · 1920×1080',    w: 1920, h: 1080, aspect: '16:9' },
];

/** Gap between format frames when they are laid out left-to-right. */
const FORMAT_FRAME_GAP = 160;

// ──────────────────────────────────────────────────────────────────────────────
// Frame management
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the 4 standard SG format frames exist on the canvas.
 * - If a frame tagged with `meta.aetherFormatFrame=true` and a matching
 *   `meta.formatId` already exists, it is reused (no duplicate created).
 * - Only missing frames are created so the function is idempotent across laps.
 *
 * Returns the shape ids of all 4 format frames in spec order.
 */
export function ensureFormatFrames(editor: Editor): string[] {
  const existingFrames = getFormatFrameShapes(editor);

  // Build a lookup: formatId → existing shape id.
  // Support both `meta.formatId` (new) and `meta.format` (legacy) so frames
  // seeded by seedArtboards or older code paths are still detected as existing.
  const existingByFormatId = new Map<string, string>();
  // Also build a lookup by aspect string for ratio-based fallback detection.
  const existingByAspect = new Map<string, string>();
  for (const f of existingFrames) {
    const meta = f.meta as Record<string, unknown>;
    const fid = (meta.formatId ?? meta.format) as string | undefined;
    if (fid) existingByFormatId.set(fid, f.id as string);
    const asp = meta.aspect as string | undefined;
    if (asp) existingByAspect.set(asp, f.id as string);
  }

  // Calculate the rightmost X for placing new frames
  let cursorX = existingFrames.reduce((max, f) => {
    const shape = f as { x: number; props: { w: number } };
    return Math.max(max, shape.x + shape.props.w + FORMAT_FRAME_GAP);
  }, 0);

  const resultIds: string[] = [];

  for (const spec of FORMAT_FRAME_SPECS) {
    // Look up by formatId first, then by aspect string (covers frames seeded
    // by older code that didn't write meta.formatId).
    const existingId =
      existingByFormatId.get(spec.formatId) ?? existingByAspect.get(spec.aspect);
    if (existingId) {
      resultIds.push(existingId);
      continue;
    }

    // Create the missing frame
    const id = createShapeId();
    editor.createShape({
      id,
      type: 'frame',
      x: cursorX,
      y: 0,
      props: { w: spec.w, h: spec.h, name: spec.name },
      meta: {
        aetherFormatFrame: true,
        aspect: spec.aspect,
        formatId: spec.formatId,
      },
    });
    cursorX += spec.w + FORMAT_FRAME_GAP;
    resultIds.push(id);
  }

  return resultIds;
}

/**
 * Return all frame shapes on the current page that are tagged as aether
 * format frames (`meta.aetherFormatFrame === true`).
 */
export function getFormatFrameShapes(editor: Editor) {
  return editor.getCurrentPageShapes().filter(
    (s) =>
      s.type === 'frame' &&
      s.meta &&
      (s.meta as Record<string, unknown>).aetherFormatFrame === true
  );
}

/**
 * Find the format frame that best matches the given aspect ratio string
 * (e.g. '1:1', '9:16'). Falls back to '1:1' when no match is found.
 */
function findMatchingFormatFrame(
  editor: Editor,
  aspect: string
): { id: string; props: { w: number; h: number } } | undefined {
  const frames = getFormatFrameShapes(editor);
  // First try exact aspect match in meta
  const byMeta = frames.find(
    (f) => (f.meta as Record<string, unknown>).aspect === aspect
  );
  if (byMeta) return byMeta as unknown as { id: string; props: { w: number; h: number } };

  // Fallback: match by W:H ratio with ±5% tolerance
  const [wStr, hStr] = aspect.split(':');
  const targetRatio = parseFloat(wStr) / parseFloat(hStr);
  const byRatio = frames.find((f) => {
    const shape = f as unknown as { props: { w: number; h: number } };
    const { w, h } = shape.props;
    if (!w || !h) return false;
    return Math.abs(w / h - targetRatio) < 0.05;
  });
  return byRatio as unknown as { id: string; props: { w: number; h: number } } | undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Variation drop
// ──────────────────────────────────────────────────────────────────────────────

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
    /** Per-format hero URLs. See AutoModeVariationView for semantics. */
    nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  };
  /** Active locale for text overlay content selection. Default: 'en-SG'. */
  locale?: string;
}

/**
 * Drop a variation's hero image(s) onto the canvas by placing them INSIDE
 * the standard format frames. If format frames don't exist, they are created
 * first (once per workspace — subsequent laps reuse them).
 *
 * Strategy:
 *   1. ensureFormatFrames — idempotent, reuses existing tagged frames.
 *   2. For each format frame, drop the hero (cropped or native) inside it
 *      as a child image shape.
 *   3. Drop text overlays as geo shapes inside the 1:1 frame (default) with
 *      enriched meta: variationId, locale, format, role, scope.
 *
 * Returns the id of the 1:1 square frame (the primary focus), or null when
 * the variation has no image URL.
 */
export function dropVariationOnCanvas({
  editor,
  variation,
  locale = 'en-SG',
}: DropVariationOnCanvasOptions): string | null {
  // Resolution order per format: nativePerFormatUrls[formatId] → atlasUrl →
  // heroImageUrl. If neither atlas nor hero is available AND we have no
  // per-format URLs, there's nothing to draw.
  const fallbackUrl = variation.atlasUrl ?? variation.heroImageUrl;
  const perFormat = variation.nativePerFormatUrls ?? {};
  const hasAnyUrl =
    Boolean(fallbackUrl) ||
    Object.values(perFormat).some((u) => typeof u === 'string' && u.length > 0);
  if (!hasAnyUrl) return null;

  // Ensure the 4 standard format frames exist (idempotent).
  const frameIds = ensureFormatFrames(editor);

  // Map format id → frame id for quick lookup
  const formatToFrameId = new Map<string, string>();
  FORMAT_FRAME_SPECS.forEach((spec, i) => {
    if (frameIds[i]) formatToFrameId.set(spec.formatId, frameIds[i]);
  });

  let primaryFrameId: string | null = null;

  for (const spec of FORMAT_FRAME_SPECS) {
    const frameId = formatToFrameId.get(spec.formatId);
    if (!frameId) continue;

    if (spec.formatId === '1x1') primaryFrameId = frameId;

    const frame = editor.getShape(frameId as never) as
      | { props: { w: number; h: number } }
      | undefined;
    if (!frame) continue;

    const { w: fw, h: fh } = frame.props;

    const formatKey = spec.formatId as '1x1' | '4x5' | '9x16' | '16x9';
    const nativeUrl = perFormat[formatKey];
    const cellUrl = nativeUrl ?? fallbackUrl;
    if (!cellUrl) continue;

    const isNative = Boolean(nativeUrl);
    const isAtlas = !isNative && Boolean(variation.atlasUrl);

    // Register the per-cell image as a canvas asset.
    //
    // Asset dims must match the source image's intrinsic dimensions or
    // tldraw downstream calls (canvas createImageData, internal resamplers)
    // can throw IndexSizeError when the asset metadata mismatches a
    // non-square or non-1024² source. The earlier hardcoded 1024×1024 for
    // every non-atlas asset broke once gpt-image-2's exact-aspect dims
    // (1024×1280 for 4:5, 1152×2048 for 9:16, 2048×1152 for 16:9) landed.
    // We now use the format frame's own dimensions — they share aspect
    // with the source image and are within tldraw's safe range.
    const assetDims = isAtlas
      ? { w: 1520, h: 1969 } // composeVariantSet's variable-row atlas
      : { w: fw, h: fh }; // format frame dims (1080×1080 / 1080×1350 / 1080×1920 / 1920×1080)
    const assetId = AssetRecordType.createId();
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: isNative
            ? `v${variation.index} ${spec.formatId} native`
            : isAtlas
              ? `v${variation.index} atlas`
              : `v${variation.index} ${spec.formatId}`,
          src: cellUrl,
          w: assetDims.w,
          h: assetDims.h,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    // Drop the image as a child of the format frame
    const imgId = createShapeId();
    editor.createShape({
      id: imgId,
      type: 'image',
      parentId: frameId as never,
      x: 0,
      y: 0,
      props: {
        assetId,
        w: fw,
        h: fh,
      },
      meta: {
        autoModeVariationId: variation.id,
        autoModeVariationIndex: variation.index,
        formatId: spec.formatId,
        renderSource: isNative ? 'native' : isAtlas ? 'atlas' : 'hero',
      },
    });
  }

  // Drop text overlays inside the 1:1 frame as geo shapes.
  // Each shape carries the full provenance needed for global/local propagation.
  if (variation.textOverlays && variation.textOverlays.length > 0) {
    const targetFrameId = primaryFrameId ?? frameIds[0];
    if (!targetFrameId) {
      // No frame to parent to — skip overlays gracefully
    } else {
      const targetFrame = editor.getShape(targetFrameId as never) as
        | { props: { w: number; h: number } }
        | undefined;
      const fw = targetFrame?.props.w ?? 1080;
      const fh = targetFrame?.props.h ?? 1080;

      for (const overlay of variation.textOverlays) {
        const copy =
          overlay.content[locale] ??
          overlay.content['en-SG'] ??
          Object.values(overlay.content)[0] ??
          '';
        if (!copy) continue;

        const bbox = overlay.zone.bbox;
        if (!bbox) continue;

        // Scale the bbox from the hero's 1024² coordinate space to the frame
        const scaleX = fw / 1024;
        const scaleY = fh / 1024;

        const align: 'start' | 'middle' | 'end' =
          overlay.textAlign === 'center'
            ? 'middle'
            : overlay.textAlign === 'end'
            ? 'end'
            : 'start';

        const overlayMeta = {
          autoModeTextOverlay: true,
          autoModeTextContent: copy,
          // 'global' = propagate to all variation frames on edit.
          // 'local'  = only this frame/cell.
          scope:
            overlay.zone.purpose === 'headline' ||
            overlay.zone.purpose === 'cta'
              ? 'global'
              : 'local',
          zone: overlay.zone.purpose,
          variationId: variation.id,
          locale,
          format: '1x1',
          role: overlay.zone.purpose,
        };

        const w = Math.max(bbox.w * scaleX, 40);
        const h = Math.max(bbox.h * scaleY, 24);

        // Editable text shape only — no rectangle guide. The user explicitly
        // does NOT want any background panel behind text overlays unless
        // absolutely necessary. tldraw's stroke + drop shadow on the text
        // itself carries enough legibility against the photographic hero.
        // Removed 2026-04-27 (was creating a faint dashed-rectangle guide
        // that read as a background panel).
        // tldraw 3.x's built-in `text` shape no longer accepts a flat
        // `text` prop (it uses `richText`, a TipTap-style doc), so it
        // throws a ValidationError when we pass `text`. Use `geo` with
        // the rectangle invisible (no fill, no outline) and the overlay
        // copy carried as the geo's text label — that label IS valid
        // and is double-click editable. Net effect: editable text on
        // canvas, NO background panel. Bug fix 2026-04-27 — replaces
        // the prior `type: 'text'` drop that crashed canvas-drop.
        const textId = createShapeId();
        editor.createShape({
          id: textId,
          type: 'geo',
          parentId: targetFrameId as never,
          x: bbox.x * scaleX,
          y: bbox.y * scaleY,
          props: {
            geo: 'rectangle',
            w,
            h,
            // Invisible chrome: no fill + dashed outline only at zoom-in.
            // Using `dash: 'draw'` (sketch-style) at small `size` keeps
            // the outline subtle; alternative `dash: 'solid'` with `size:
            // 's'` reads as a faint hairline. Either way, no fill panel.
            fill: 'none' as const,
            dash: 'draw' as const,
            color: 'white' as const,
            size: 's' as const,
            verticalAlign: 'middle' as const,
            align,
            text: copy,
            labelColor: 'white' as const,
            font: 'sans' as const,
          } as Record<string, unknown>,
          meta: { ...overlayMeta, shapeRole: 'overlay-text' },
        } as Parameters<typeof editor.createShape>[0]);
      }
    }
  }

  // Zoom to the primary (1:1) frame so the creator sees the result
  if (primaryFrameId) {
    editor.select(primaryFrameId as never);
    editor.zoomToSelection({ animation: { duration: 300 } });
  } else if (frameIds.length > 0) {
    editor.select(frameIds[0] as never);
    editor.zoomToSelection({ animation: { duration: 300 } });
  }

  return primaryFrameId ?? frameIds[0] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Global text propagation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Payload sent to the Convex updateVariationOverlay mutation when a global-
 * scope text shape is edited. The mutation persists the change so it survives
 * page refreshes and is visible to other collaborators.
 */
export interface VariationOverlayUpdate {
  variationId: string;
  locale: string;
  format: string;
  scope: 'global' | 'local';
  role: string;
  text: string;
}

/**
 * Wire up a tldraw store.listen callback that fans out edits to global-scoped
 * text overlay shapes to all sibling shapes in the same variation + role.
 *
 * - `global` → update all sibling shapes with matching `meta.variationId` and
 *   `meta.role` (regardless of locale or format). Calls the Convex mutation.
 * - `local` → no fan-out; shape stays isolated.
 *
 * Returns an unsubscribe function. The caller (WorkspaceShell) should call it
 * on cleanup (component unmount or when the editor changes).
 */
export function buildGlobalTextPropagator(
  editor: Editor,
  onUpdate: (args: VariationOverlayUpdate) => Promise<void>
): () => void {
  // Track the last text value per shape id to detect actual content changes
  // (store.listen fires for all field changes, not just text).
  const lastText = new Map<string, string>();

  const unsubscribe = editor.store.listen(
    (event: {
      changes: {
        updated: Record<string, [unknown, unknown]>;
      };
    }) => {
      const updated = event.changes.updated;
      if (!updated || typeof updated !== 'object') return;

      for (const [shapeId, [, nextRaw]] of Object.entries(updated)) {
        const next = nextRaw as Record<string, unknown>;
        if (!next || next.type !== 'geo') continue;

        const meta = (next.meta ?? {}) as Record<string, unknown>;
        if (!meta.autoModeTextOverlay) continue;

        const scope = meta.scope as string | undefined;
        const variationId = meta.variationId as string | undefined;
        const role = meta.role as string | undefined;
        const locale = meta.locale as string | undefined;
        const format = meta.format as string | undefined;

        if (!variationId || !role) continue;

        // Extract the current text from props
        const props = (next.props ?? {}) as Record<string, unknown>;
        const currentText =
          (props.text as string | undefined) ??
          (props.label as string | undefined) ??
          '';

        // Only act on actual text changes
        const prev = lastText.get(shapeId);
        if (prev === currentText) continue;
        lastText.set(shapeId, currentText);

        if (scope !== 'global') continue;

        // Fan out to all sibling shapes: same variationId + role
        const siblings = editor.getCurrentPageShapes().filter((s) => {
          if (s.id === (shapeId as never)) return false; // skip self
          const sm = (s.meta ?? {}) as Record<string, unknown>;
          return (
            sm.autoModeTextOverlay === true &&
            sm.variationId === variationId &&
            sm.role === role
          );
        });

        for (const sibling of siblings) {
          editor.updateShape({
            id: sibling.id as never,
            type: 'geo',
            props: {
              ...((sibling as unknown as { props: Record<string, unknown> }).props ?? {}),
              text: currentText,
              label: currentText,
            },
          } as Parameters<typeof editor.updateShape>[0]);
        }

        // Persist to Convex (fire-and-forget; errors logged by caller)
        void onUpdate({
          variationId,
          locale: locale ?? 'en-SG',
          format: format ?? '1x1',
          scope: 'global',
          role,
          text: currentText,
        });
      }
    },
    // Listen to 'change' events (the correct subscription type for store)
    { source: 'user', scope: 'document' } as never
  );

  return () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Legacy helpers (preserved for backward compat)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return the shape ids of all tldraw frames that were placed by Auto Mode
 * (tagged with `meta.autoModeVariationId`). Used by the dedup guard in
 * WorkspaceShell to prevent re-dropping already-placed variations.
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
