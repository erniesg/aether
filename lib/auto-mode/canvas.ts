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
import { AETHER_TEXT_SHAPE_TYPE, type AetherTextShapeProps } from '@/components/canvas/shapes/AetherTextShape';

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
  /** Workspace id — threaded into the AetherTextShape props so the
   *  text-overlay bridge can persist edits to the right workspace. */
  wsId?: string;
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
  wsId = 'demo-ws',
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

  // Drop text overlays as geo shapes inside EVERY format frame — not just
  // 1:1. Earlier we only dropped on primary; the global-text propagator
  // (lib/auto-mode/canvas.ts:buildGlobalTextPropagator) walks siblings by
  // (variationId, role) so an edit on a 1:1 headline shape only fanned out
  // when other frames had matching shapes. With shapes only on 1:1 there
  // were no siblings to update; the 4:5 / 9:16 / 16:9 frames showed
  // whatever text the atlas / native render had baked into the image at
  // lap-time, which differed per format because applyTextOverlay generates
  // distinct copy per (zone × format × locale) cell.
  //
  // Now: each format frame gets its OWN AetherTextShape per overlay, all
  // sharing variationId + role + scope='global'. Editing one propagates
  // to the others via the propagator's storeListen. Each shape's bbox is
  // scaled from 1024² hero coords to the per-frame dims so headlines land
  // in the same relative position regardless of aspect.
  if (variation.textOverlays && variation.textOverlays.length > 0) {
    const targetFrameIds = frameIds.filter((id): id is string => Boolean(id));
    if (targetFrameIds.length === 0) {
      // No frame to parent to — skip overlays gracefully
    } else {
      // Resolve format id per frame so the shape can record it for
      // provenance ("which frame's overlay was edited"). frame ids are
      // ordered the same as FORMAT_FRAME_SPECS by ensureFormatFrames.
      const formatIdForFrame = new Map<string, string>();
      FORMAT_FRAME_SPECS.forEach((spec, i) => {
        const fid = frameIds[i];
        if (fid) formatIdForFrame.set(fid, spec.formatId);
      });

      for (const overlay of variation.textOverlays) {
        const copy =
          overlay.content[locale] ??
          overlay.content['en-SG'] ??
          Object.values(overlay.content)[0] ??
          '';
        if (!copy) continue;

        const bbox = overlay.zone.bbox;
        if (!bbox) continue;

        // Drop one shape per format frame, all carrying the SAME (variationId,
        // role) so the global propagator treats them as siblings.
        for (const targetFrameId of targetFrameIds) {
          const targetFrame = editor.getShape(targetFrameId as never) as
            | { props: { w: number; h: number } }
            | undefined;
          if (!targetFrame) continue;
          const fw = targetFrame.props.w;
          const fh = targetFrame.props.h;

          // Scale the bbox from the hero's 1024² coordinate space to the
          // per-frame dims. Same relative placement across aspects.
          const scaleX = fw / 1024;
          const scaleY = fh / 1024;
          const w = Math.max(bbox.w * scaleX, 40);
          const h = Math.max(bbox.h * scaleY, 24);
          const formatId = formatIdForFrame.get(targetFrameId) ?? '1x1';

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
            format: formatId,
            role: overlay.zone.purpose,
          };

          // Editable text shape only — no rectangle guide. The user explicitly
          // does NOT want any background panel behind text overlays unless
          // absolutely necessary. AetherTextShape's stroke + drop shadow on
          // the text itself carries enough legibility against the photographic
          // hero. Mirrors the shape created by text-overlay-bridge.tsx so the
          // global-text propagator there picks edits up identically.
          const textId = createShapeId();
          const textProps: AetherTextShapeProps = {
            content: overlay.content,
            bcp47Locale: locale,
            sourceLocale: locale,
            w,
            h,
            // No structured AetherTextPlacement at this drop site — the
            // auto-mode lap stored only a bbox. Pass empty JSON so the
            // validator accepts it; bridge consumers tolerate this.
            placement: '',
            protectedRegions: '[]',
            wsId,
            artboardId: targetFrameId,
            textOverlayRowId: '',
            capabilityRunId: '',
            fontSize: Math.max(12, Math.round(h * 0.3)),
            color: '#ffffff',
            textAlign:
              overlay.textAlign === 'center'
                ? 'center'
                : overlay.textAlign === 'end'
                ? 'end'
                : 'start',
            fontWeight: 600,
            backgroundColor: '',
          };
          editor.createShape({
            id: textId,
            type: AETHER_TEXT_SHAPE_TYPE as never,
            parentId: targetFrameId as never,
            x: bbox.x * scaleX,
            y: bbox.y * scaleY,
            props: textProps as never,
            meta: { ...overlayMeta, shapeRole: 'overlay-text' },
          } as Parameters<typeof editor.createShape>[0]);
        }
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
        // Listen on AetherTextShape (the type the canvas drop creates,
        // commit d6ff101) AND legacy `geo` (older drops still on canvas).
        // Filtering only `geo` was breaking global propagation: edits on
        // aether-text shapes never reached this listener at all. Bug fix
        // 2026-04-27 — caused "no global edits + no local scope" UX.
        if (!next || (next.type !== 'aether-text' && next.type !== 'geo')) continue;

        const meta = (next.meta ?? {}) as Record<string, unknown>;
        if (!meta.autoModeTextOverlay) continue;

        const scope = meta.scope as string | undefined;
        const variationId = meta.variationId as string | undefined;
        const role = meta.role as string | undefined;
        const locale = meta.locale as string | undefined;
        const format = meta.format as string | undefined;

        if (!variationId || !role) continue;

        // Extract the current text from props. AetherTextShape stores
        // copy in props.content[locale]; legacy geo carries it as
        // props.text / props.label.
        const props = (next.props ?? {}) as Record<string, unknown>;
        const content = props.content as Record<string, string> | undefined;
        const bcp47Locale =
          (props.bcp47Locale as string | undefined) ?? locale ?? 'en-SG';
        const currentText =
          content?.[bcp47Locale] ??
          content?.['en-SG'] ??
          (props.text as string | undefined) ??
          (props.label as string | undefined) ??
          '';

        // Only act on actual text changes
        const prev = lastText.get(shapeId);
        if (prev === currentText) continue;
        lastText.set(shapeId, currentText);

        if (scope !== 'global') continue;

        // Fan out to all sibling shapes: same variationId + role.
        // Updates the corresponding locale slot of the sibling's
        // content map for AetherTextShape; falls back to text/label
        // for legacy geo shapes.
        const siblings = editor.getCurrentPageShapes().filter((s) => {
          if (s.id === (shapeId as never)) return false;
          const sm = (s.meta ?? {}) as Record<string, unknown>;
          return (
            sm.autoModeTextOverlay === true &&
            sm.variationId === variationId &&
            sm.role === role
          );
        });

        for (const sibling of siblings) {
          const sShape = sibling as unknown as {
            type: string;
            props: Record<string, unknown>;
          };
          if (sibling.type === 'aether-text') {
            const sContent =
              (sShape.props.content as Record<string, string> | undefined) ?? {};
            const sLocale =
              (sShape.props.bcp47Locale as string | undefined) ?? bcp47Locale;
            editor.updateShape({
              id: sibling.id as never,
              type: 'aether-text',
              props: {
                ...sShape.props,
                content: { ...sContent, [sLocale]: currentText },
              },
            } as Parameters<typeof editor.updateShape>[0]);
          } else {
            editor.updateShape({
              id: sibling.id as never,
              type: 'geo',
              props: {
                ...sShape.props,
                text: currentText,
                label: currentText,
              },
            } as Parameters<typeof editor.updateShape>[0]);
          }
        }

        // Persist to Convex (fire-and-forget; errors logged by caller)
        void onUpdate({
          variationId,
          locale: locale ?? bcp47Locale,
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
