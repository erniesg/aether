/**
 * SemanticCreativeComponent — the intent-aware creative primitive.
 *
 * Per the 2026-04-25 demo thesis ("creative is responsive by default"),
 * one component drives every artifact: the layout-aware generation prompt
 * (issue #105), the crop-from-hero utility (#106), the text-overlay planner
 * (#90 rescoped), and global-edit propagation (#108). It's produced by
 * `sketchToComponent` (#107) from a rough sketch + brand + references and
 * is the single source of truth from then on.
 *
 * Coordinates everywhere are normalized 0..1 in the source image's frame
 * (origin top-left), so they survive any crop arithmetic without re-projection.
 */

/**
 * Axis-aligned rectangle, normalized to the [0, 1] range on both axes.
 * `x + w` and `y + h` must each be ≤ 1.
 */
export interface NormalizedBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Why a safe zone exists — drives the natural-language hint we feed the
 * image generator and (later) the placement of the corresponding text
 * overlay layer.
 */
export type SafeZonePurpose =
  | 'headline'
  | 'subhead'
  | 'body'
  | 'caption'
  | 'cta'
  | 'logo'
  | 'product'
  | 'hero';

export interface SafeZone {
  purpose: SafeZonePurpose;
  /** Where this zone lives in the hero frame. */
  bbox: NormalizedBBox;
  /**
   * If true, the zone must remain unclipped after every aspect-ratio crop.
   * Defaults to true for hero/product/logo, false for ancillary copy.
   */
  mustSurviveAllCrops?: boolean;
}

export interface FormatTarget {
  id: string;
  w: number;
  h: number;
  label?: string;
}

/**
 * The compact intent representation. Produced by Opus 4.7 from a rough
 * sketch + brand + refs. Drives every downstream renderer.
 */
export interface SemanticCreativeComponent {
  hero: { description: string };
  product?: { description: string };
  offer?: { weight: 'aggressive' | 'soft' };
  mood: { keywords: string[] };
  safeZones: SafeZone[];
  cropPriorities: {
    /** The single most important region to keep across all crops. */
    primary: NormalizedBBox;
    /** Important-but-secondary; preserved when geometry permits. */
    secondary?: NormalizedBBox;
  };
  formats: FormatTarget[];
}
