/**
 * Minimum scaffold for the text-mask pipeline. T2 / T3 under the
 * multilingual text-overlay umbrella (#66) will extend this into the full
 * video-text-mask capability; T1 (#67) only needs `TextMaskTextStyle` so
 * `TextOverlayStyle` can be declared as a structural superset rather than
 * duplicating the same typography fields in two places.
 *
 * The field list is intentionally small — anything a canvas text layer and a
 * video text-mask both have to agree on. Canvas-only fields
 * (letterSpacing, lineHeight, textAlign, color, background, stroke, shadow,
 * language) live on `TextOverlayStyle` and are not mirrored here.
 */
export interface TextMaskTextStyle {
  fontFamily: string;
  /** Target-artboard pixels. The video pipeline rasterises at render time. */
  fontSize: number;
  /** Numeric weight (100..900) — keeps font-loading decisions typed. */
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}
