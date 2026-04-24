import {
  SAFE_ZONE_PRESETS,
  type SafeZonePresetId,
  type SafeZoneRect,
} from './safeZones';

// Canonical canvas aspect (w/h) for presets that use kind 'center-crop'.
// reel-cover ships on 9:16 Reels frames; the crop window is letterboxed
// against that ratio. Kept local so `reframeCheck` doesn't depend on the
// artboard-seed module.
const REEL_CANVAS_RATIO = 9 / 16;

export interface ReframeCheckInput {
  /** Normalized [0,1] bbox of the subject / hero in the image. */
  subjectBbox: { x: number; y: number; w: number; h: number };
  preset: SafeZonePresetId;
}

export type ReframeBandId = 'top' | 'bottom' | 'left' | 'right' | 'crop';

export interface ReframeBandViolation {
  bandId: ReframeBandId;
  /** Fraction of the subject area that overlaps this unsafe band. */
  overlapFraction: number;
}

export type ReframeStatus = 'ok' | 'warn' | 'block';
export type ReframeAction = 'none' | 'shift' | 'inpaint';

export interface ReframeCheckResult {
  status: ReframeStatus;
  /** Total fraction of the subject's area that falls in unsafe regions. */
  intrusionFraction: number;
  violations: ReframeBandViolation[];
  suggestedAction: ReframeAction;
}

const WARN_THRESHOLD = 0.05;
const BLOCK_THRESHOLD = 0.2;

function rectArea(r: SafeZoneRect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

function intersectArea(a: SafeZoneRect, b: SafeZoneRect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return rectArea({ x: left, y: top, w: right - left, h: bottom - top });
}

function statusFor(fraction: number): { status: ReframeStatus; action: ReframeAction } {
  if (fraction >= BLOCK_THRESHOLD) return { status: 'block', action: 'inpaint' };
  if (fraction >= WARN_THRESHOLD) return { status: 'warn', action: 'shift' };
  return { status: 'ok', action: 'none' };
}

/**
 * Evaluate whether a subject bbox respects the target variant's safe zone.
 * Returns a per-band intrusion report plus an overall status and the
 * suggested follow-up (none | shift | inpaint). This is a pure function
 * so callers — fanOut post-processors, the UI's "fix framing" button,
 * or the agent planner — can all share the same invariant.
 *
 * The subjectBbox is in normalized image coordinates; the function
 * assumes the image fills the variant frame and ignores output aspect
 * ratio drift. For center-crop presets (reel-cover), the evaluator
 * reports a single `crop` violation for whatever area sits outside the
 * centered crop window.
 */
export function evaluateSubjectVsSafeZone(
  input: ReframeCheckInput
): ReframeCheckResult {
  const subject = input.subjectBbox;
  const subjectArea = rectArea(subject);
  const spec = SAFE_ZONE_PRESETS[input.preset];

  if (subjectArea === 0 || spec.kind === 'none') {
    return { status: 'ok', intrusionFraction: 0, violations: [], suggestedAction: 'none' };
  }

  if (spec.kind === 'center-crop') {
    const cropRatio = spec.cropAspectRatio ?? 1;
    let safe: SafeZoneRect;
    if (REEL_CANVAS_RATIO < cropRatio) {
      const safeH = REEL_CANVAS_RATIO / cropRatio;
      safe = { x: 0, y: (1 - safeH) / 2, w: 1, h: safeH };
    } else {
      const safeW = cropRatio / REEL_CANVAS_RATIO;
      safe = { x: (1 - safeW) / 2, y: 0, w: safeW, h: 1 };
    }
    const inside = intersectArea(subject, safe);
    const outside = subjectArea - inside;
    const fraction = outside / subjectArea;
    const violations: ReframeBandViolation[] =
      fraction > 0 ? [{ bandId: 'crop', overlapFraction: fraction }] : [];
    const { status, action } = statusFor(fraction);
    return { status, intrusionFraction: fraction, violations, suggestedAction: action };
  }

  const insets = spec.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const middleH = Math.max(0, 1 - insets.top - insets.bottom);
  const bands: Array<{ id: ReframeBandId; rect: SafeZoneRect }> = [];
  if (insets.top > 0) bands.push({ id: 'top', rect: { x: 0, y: 0, w: 1, h: insets.top } });
  if (insets.bottom > 0) {
    bands.push({
      id: 'bottom',
      rect: { x: 0, y: 1 - insets.bottom, w: 1, h: insets.bottom },
    });
  }
  if (insets.left > 0 && middleH > 0) {
    bands.push({
      id: 'left',
      rect: { x: 0, y: insets.top, w: insets.left, h: middleH },
    });
  }
  if (insets.right > 0 && middleH > 0) {
    bands.push({
      id: 'right',
      rect: { x: 1 - insets.right, y: insets.top, w: insets.right, h: middleH },
    });
  }

  const violations: ReframeBandViolation[] = [];
  let totalIntrusion = 0;
  for (const band of bands) {
    const overlap = intersectArea(subject, band.rect);
    if (overlap <= 0) continue;
    const fraction = overlap / subjectArea;
    violations.push({ bandId: band.id, overlapFraction: fraction });
    totalIntrusion += fraction;
  }

  const { status, action } = statusFor(Math.min(1, totalIntrusion));
  return {
    status,
    intrusionFraction: Math.min(1, totalIntrusion),
    violations,
    suggestedAction: action,
  };
}

/**
 * Build a plain-language edit prompt for a safe-zone-violating result. Used
 * by the fanOut post-gen reframer: when the evaluator says we need a fix,
 * this produces the instruction we hand to /api/generate/edit. Intentionally
 * terse — the guidance layer appends the full safe-zone context on top.
 */
export function buildReframePrompt(
  result: ReframeCheckResult,
  preset: SafeZonePresetId
): string {
  if (result.status === 'ok' || result.violations.length === 0) return '';
  const spec = SAFE_ZONE_PRESETS[preset];
  const bandPhrase = result.violations
    .map((v) => v.bandId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .join(' and ');
  const verb = result.suggestedAction === 'inpaint' ? 'Extend the background into' : 'Shift the composition away from';
  return `${verb} the ${bandPhrase} band${result.violations.length > 1 ? 's' : ''} so the hero subject is fully inside the ${spec.label} safe area.`;
}

