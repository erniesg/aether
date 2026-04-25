/**
 * Pure adapter: converts the JSON payload returned by the SAM3 segmentation
 * pipeline into `ForbiddenRegion[]` that the text-overlay planner can consume.
 *
 * The SAM3 result carries pixel-space bboxes; the planner works in normalized
 * 0..1 space (origin top-left), matching `NormalizedBBox` everywhere else in
 * the codebase. This module owns that conversion and nothing else.
 */
import type { ForbiddenRegion } from '@/lib/text-overlay/types';

/** One entry in the `masks` array from the segmentation response. */
export interface SegmentMaskEntry {
  kind: ForbiddenRegion['kind'];
  /** Pixel-space bounding box in the source image's coordinate system. */
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

/**
 * The JSON shape produced by `/api/segment` (or the Modal SAM3 worker) that
 * carries one or more detected-region masks. Callers can pass the `raw` field
 * from the route response directly here.
 */
export interface SegmentMaskJson {
  /** Full pixel dimensions of the source image. */
  width: number;
  height: number;
  masks: SegmentMaskEntry[];
}

/** Clamp a value to [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Convert a SAM3 mask payload into the normalized `ForbiddenRegion[]` that
 * `applyTextOverlay` consumes.
 *
 * - Normalizes pixel-space bboxes to 0..1 using `width`/`height`.
 * - Clamps to [0,1] so out-of-bounds masks don't break downstream geometry.
 * - Returns `[]` when `width` or `height` is 0 (can't normalize safely).
 */
export function segmentationToForbiddenRegions(
  maskJson: SegmentMaskJson
): ForbiddenRegion[] {
  const { width, height, masks } = maskJson;

  // Guard: zero-dimension source → cannot produce valid normalized coordinates.
  if (!width || !height || width <= 0 || height <= 0) {
    return [];
  }

  return masks.map((mask): ForbiddenRegion => {
    const normX = clamp(mask.bbox.x / width, 0, 1);
    const normY = clamp(mask.bbox.y / height, 0, 1);
    const normW = clamp(mask.bbox.w / width, 0, 1 - normX);
    const normH = clamp(mask.bbox.h / height, 0, 1 - normY);

    return {
      kind: mask.kind,
      bbox: { x: normX, y: normY, w: normW, h: normH },
      confidence: mask.confidence,
    };
  });
}
