/**
 * Crop-from-hero utility (issue #106).
 *
 * Pure function. Given one large hero render and a list of target formats,
 * compute per-format crop rectangles that preserve every safe zone marked
 * `mustSurviveAllCrops`. Output is in tldraw's image-shape crop format
 * (normalized topLeft / bottomRight pair) so the caller can drop a single
 * cropped image shape into each artboard with `editor.createShape({...})`.
 *
 * The whole demo thesis ("creative is responsive by default") rests on this:
 * one render produces N format variants for free. The companion piece is
 * `buildLayoutAwarePrompt` (issue #105) which makes the hero crop-friendly
 * by reserving safe zones in the prompt.
 */

import type {
  FormatTarget,
  SafeZone,
} from '@/lib/types/semantic-component';

export interface HeroAsset {
  /** Pixel width of the rendered hero. */
  width: number;
  /** Pixel height of the rendered hero. */
  height: number;
  /** Optional source URL — passed through into output for the caller. */
  url?: string;
}

/** tldraw `TLShapeCrop` — normalized [0,1] in the asset's coord space. */
export interface TldrawCrop {
  topLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export type CropFit = 'fitted' | 'partial' | 'centered-fallback';

export interface CroppedFormat {
  formatId: string;
  format: FormatTarget;
  /** Crop spec ready to drop into `props.crop` of a tldraw image shape. */
  crop: TldrawCrop;
  /** Output dimensions: equal to the format's pixel size. */
  w: number;
  h: number;
  /**
   * `fitted`           — every must-survive safe zone is fully contained.
   * `partial`          — at least one zone gets clipped (hero geometry
   *                      can't accommodate it). Caller can warn the user
   *                      or trigger a re-prompt with relaxed safe zones.
   * `centered-fallback`— no must-survive zones supplied; cropped from the
   *                      hero center.
   */
  fit: CropFit;
  /** Subset of must-survive zones that get clipped (empty unless fit='partial'). */
  clippedZones: SafeZone[];
}

export interface CropHeroToFormatsInput {
  heroAsset: HeroAsset;
  formats: ReadonlyArray<FormatTarget>;
  /**
   * Same array as `SemanticCreativeComponent.safeZones`. Zones with
   * `mustSurviveAllCrops` (defaults to `true` when undefined) are the
   * ones we try to preserve in every crop.
   */
  safeZones?: ReadonlyArray<SafeZone>;
}

export function cropHeroToFormats(
  input: CropHeroToFormatsInput
): CroppedFormat[] {
  const { heroAsset, formats, safeZones = [] } = input;
  validateHero(heroAsset);
  const mustSurvive = safeZones.filter(
    (z) => z.mustSurviveAllCrops !== false
  );
  return formats.map((format) =>
    cropOneFormat(heroAsset, format, mustSurvive)
  );
}

function validateHero(hero: HeroAsset): void {
  if (!Number.isFinite(hero.width) || !Number.isFinite(hero.height)) {
    throw new Error('cropHeroToFormats: heroAsset.width/height must be finite numbers');
  }
  if (hero.width <= 0 || hero.height <= 0) {
    throw new Error('cropHeroToFormats: heroAsset dimensions must be positive');
  }
}

function cropOneFormat(
  hero: HeroAsset,
  format: FormatTarget,
  mustSurvive: ReadonlyArray<SafeZone>
): CroppedFormat {
  if (format.w <= 0 || format.h <= 0) {
    throw new Error(
      `cropHeroToFormats: format ${format.id} has non-positive dimensions`
    );
  }

  const targetAspect = format.w / format.h;
  const heroAspect = hero.width / hero.height;

  // Largest rectangle of the target aspect that fits inside the hero.
  let cropWPx: number;
  let cropHPx: number;
  if (heroAspect >= targetAspect) {
    cropHPx = hero.height;
    cropWPx = hero.height * targetAspect;
  } else {
    cropWPx = hero.width;
    cropHPx = hero.width / targetAspect;
  }

  let cropXPx: number;
  let cropYPx: number;
  let fit: CropFit;
  let clipped: SafeZone[] = [];

  if (mustSurvive.length === 0) {
    cropXPx = (hero.width - cropWPx) / 2;
    cropYPx = (hero.height - cropHPx) / 2;
    fit = 'centered-fallback';
  } else {
    const bb = pixelBoundingBox(mustSurvive, hero);
    cropXPx = bb.cx - cropWPx / 2;
    cropYPx = bb.cy - cropHPx / 2;
    cropXPx = clamp(cropXPx, 0, hero.width - cropWPx);
    cropYPx = clamp(cropYPx, 0, hero.height - cropHPx);

    clipped = mustSurvive.filter((z) => !bboxContainsZone({ x: cropXPx, y: cropYPx, w: cropWPx, h: cropHPx }, z, hero));
    fit = clipped.length === 0 ? 'fitted' : 'partial';
  }

  // Convert pixel crop rect → tldraw normalized topLeft / bottomRight.
  const crop: TldrawCrop = {
    topLeft: {
      x: cropXPx / hero.width,
      y: cropYPx / hero.height,
    },
    bottomRight: {
      x: (cropXPx + cropWPx) / hero.width,
      y: (cropYPx + cropHPx) / hero.height,
    },
  };

  return {
    formatId: format.id,
    format,
    crop,
    w: format.w,
    h: format.h,
    fit,
    clippedZones: clipped,
  };
}

function pixelBoundingBox(
  zones: ReadonlyArray<SafeZone>,
  hero: HeroAsset
): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const z of zones) {
    const zx = z.bbox.x * hero.width;
    const zy = z.bbox.y * hero.height;
    minX = Math.min(minX, zx);
    minY = Math.min(minY, zy);
    maxX = Math.max(maxX, zx + z.bbox.w * hero.width);
    maxY = Math.max(maxY, zy + z.bbox.h * hero.height);
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function bboxContainsZone(
  cropPx: { x: number; y: number; w: number; h: number },
  zone: SafeZone,
  hero: HeroAsset
): boolean {
  const zx = zone.bbox.x * hero.width;
  const zy = zone.bbox.y * hero.height;
  const zw = zone.bbox.w * hero.width;
  const zh = zone.bbox.h * hero.height;
  // Allow sub-pixel tolerance for FP drift on perfect-fit cases.
  const eps = 0.5;
  return (
    zx >= cropPx.x - eps &&
    zy >= cropPx.y - eps &&
    zx + zw <= cropPx.x + cropPx.w + eps &&
    zy + zh <= cropPx.y + cropPx.h + eps
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}
