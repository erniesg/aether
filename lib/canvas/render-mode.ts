/**
 * Render-mode selector — Mode A (fanout) vs Mode B (crop) vs auto.
 *
 * Per the 2026-04-25 demo thesis ("creative is responsive by default"), the
 * canvas can render the hero scene one of two ways:
 *
 *   - **crop** (Mode B): one render at the largest needed size, geometric
 *     crops to every format. Cheap, fast, safe-zones survive.
 *   - **fanout** (Mode A): N renders, one per format, each shaped to that
 *     format's exact aspect ratio. Expensive, slower, but tolerates wild
 *     aspect spreads where a single hero couldn't survive every crop.
 *
 * The auto heuristic is a single number: max-aspect / min-aspect across the
 * format set. A tight set (≤ spreadThreshold) crops cleanly; a wide set fans
 * out. The composer chip exposes this as `auto | crop | fanout`; auto is the
 * default and `pickRenderMode` resolves it.
 *
 * Module is pure — no tldraw, no Convex, no providers. Lives next to the
 * crop arithmetic (cropToFormat.ts, PR #110) so the composer can consume
 * both from the same import path.
 */

export type RenderMode = 'crop' | 'fanout';
export type RenderModeChoice = RenderMode | 'auto';

export interface FormatAspect {
  /** Width in pixels (or any consistent unit). */
  w: number;
  /** Height in pixels. */
  h: number;
}

export interface PickRenderModeOptions {
  /**
   * Spread above which auto mode tips into fanout. The ratio is computed as
   * `max(aspect_i) / min(aspect_i)` across every supplied format, where
   * `aspect_i = w_i / h_i`. Default 2.
   *
   * 1.0 = identical aspect ratios (always crop).
   * 2.0 = e.g. 1:1 + 1:2 (still crops cleanly with mid-frame anchor).
   * 3.0+ = e.g. story + banner (single hero starts to break safe zones).
   */
  spreadThreshold?: number;
}

const DEFAULT_SPREAD_THRESHOLD = 2;

/**
 * Pick a render mode for the supplied format set.
 *
 * `choice` defaults to `'auto'`. When the caller pins `'crop'` or `'fanout'`
 * the heuristic is bypassed entirely — the composer chip uses this to give
 * creators a manual override that survives the full `formats` set changing
 * out from under them.
 *
 * Throws when any format has a non-positive dimension; aspect arithmetic
 * silently dividing by zero would be a worse demo failure than an explicit
 * crash.
 */
export function pickRenderMode(
  formats: ReadonlyArray<FormatAspect>,
  choice: RenderModeChoice = 'auto',
  options: PickRenderModeOptions = {}
): RenderMode {
  if (choice === 'crop' || choice === 'fanout') return choice;

  // Single render and zero-format cases have nothing to fan out to.
  if (formats.length <= 1) return 'crop';

  const spread = aspectSpread(formats);
  const threshold = options.spreadThreshold ?? DEFAULT_SPREAD_THRESHOLD;
  return spread <= threshold ? 'crop' : 'fanout';
}

/**
 * `max(w/h) / min(w/h)` across the format set. Returns 1 for an empty set
 * (no spread to measure) so callers can divide / compare without guarding.
 */
export function aspectSpread(formats: ReadonlyArray<FormatAspect>): number {
  if (formats.length === 0) return 1;
  let min = Infinity;
  let max = 0;
  for (const f of formats) {
    if (!Number.isFinite(f.w) || !Number.isFinite(f.h) || f.w <= 0 || f.h <= 0) {
      throw new Error(
        `aspectSpread: format must have positive finite w and h, got w=${f.w}, h=${f.h}`
      );
    }
    const ratio = f.w / f.h;
    if (ratio < min) min = ratio;
    if (ratio > max) max = ratio;
  }
  // A single format collapses min === max; spread is 1.
  return max / min;
}

/**
 * Diagnostic shape for the composer chip — surfaces *why* auto picked what
 * it did so a creator who wants to override understands what they're
 * overriding. Pure data; no rendering concerns.
 */
export interface RenderModeDecision {
  mode: RenderMode;
  spread: number;
  threshold: number;
  reason:
    | 'override-crop'
    | 'override-fanout'
    | 'single-format'
    | 'tight-spread-cropped'
    | 'wide-spread-fanned-out';
}

export function explainRenderMode(
  formats: ReadonlyArray<FormatAspect>,
  choice: RenderModeChoice = 'auto',
  options: PickRenderModeOptions = {}
): RenderModeDecision {
  const threshold = options.spreadThreshold ?? DEFAULT_SPREAD_THRESHOLD;
  if (choice === 'crop') {
    return { mode: 'crop', spread: aspectSpread(formats), threshold, reason: 'override-crop' };
  }
  if (choice === 'fanout') {
    return { mode: 'fanout', spread: aspectSpread(formats), threshold, reason: 'override-fanout' };
  }
  if (formats.length <= 1) {
    return { mode: 'crop', spread: 1, threshold, reason: 'single-format' };
  }
  const spread = aspectSpread(formats);
  if (spread <= threshold) {
    return { mode: 'crop', spread, threshold, reason: 'tight-spread-cropped' };
  }
  return { mode: 'fanout', spread, threshold, reason: 'wide-spread-fanned-out' };
}
