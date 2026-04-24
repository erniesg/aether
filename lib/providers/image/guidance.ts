import { SAFE_ZONE_PRESETS, type SafeZonePresetId } from '@/lib/canvas/safeZones';

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NegativeZoneInput extends NormalizedRect {
  label?: string;
}

export interface CompositionGuidanceInput {
  preset?: SafeZonePresetId | null;
  focusArea?: NormalizedRect;
  negativeZones?: ReadonlyArray<NegativeZoneInput>;
}

export interface AvoidanceRegion {
  id: string;
  rect: NormalizedRect;
  label: string;
}

export interface CompositionGuidance {
  promptSuffix: string;
  negativePrompt: string;
  avoidanceRegions: AvoidanceRegion[];
}

const STORY_NEGATIVE = 'text, UI elements, stickers, timestamps, platform chrome';
const LINKEDIN_NEGATIVE = 'text, UI elements, platform chrome, logos at edges';
const REEL_COVER_NEGATIVE = 'critical subject at top or bottom edges';

// Canvas aspect we assume for the Reel-cover center-crop math. The cover
// survives a 420×654 window; Reels canvases are 9:16, so we derive the safe
// slice against that ratio. If a frame ever ships with a different aspect,
// the consumer should pass a focusArea instead of the preset.
const REEL_CANVAS_RATIO = 9 / 16;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clampRect(rect: NormalizedRect): NormalizedRect | null {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const right = clamp01(rect.x + rect.w);
  const bottom = clamp01(rect.y + rect.h);
  const w = right - x;
  const h = bottom - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

interface PresetFragments {
  regions: AvoidanceRegion[];
  suffix: string[];
  negative: string[];
}

function centerCropFragments(preset: SafeZonePresetId, cropAspectRatio: number): PresetFragments {
  const frameIsTaller = REEL_CANVAS_RATIO < cropAspectRatio;
  let rect: NormalizedRect;
  if (frameIsTaller) {
    const safeH = REEL_CANVAS_RATIO / cropAspectRatio;
    const y = (1 - safeH) / 2;
    rect = { x: 0, y, w: 1, h: safeH };
  } else {
    const safeW = cropAspectRatio / REEL_CANVAS_RATIO;
    const x = (1 - safeW) / 2;
    rect = { x, y: 0, w: safeW, h: 1 };
  }

  return {
    regions: [
      {
        id: `preset:${preset}:crop-window`,
        rect,
        label: 'Reel cover crop window',
      },
    ],
    suffix: [
      `Keep the subject and any key detail inside the centered Reel cover crop window — roughly ${pct(rect.w)} × ${pct(rect.h)} of the frame, centered. The area outside that window is cropped away in Meta's cover preview.`,
    ],
    negative: [REEL_COVER_NEGATIVE],
  };
}

function insetFragments(
  preset: SafeZonePresetId,
  label: string,
  insets: { top: number; right: number; bottom: number; left: number }
): PresetFragments {
  const regions: AvoidanceRegion[] = [];
  if (insets.top > 0) {
    regions.push({
      id: `preset:${preset}:top`,
      rect: { x: 0, y: 0, w: 1, h: insets.top },
      label: `${label} top chrome`,
    });
  }
  if (insets.bottom > 0) {
    regions.push({
      id: `preset:${preset}:bottom`,
      rect: { x: 0, y: 1 - insets.bottom, w: 1, h: insets.bottom },
      label: `${label} bottom chrome`,
    });
  }
  const middleH = 1 - insets.top - insets.bottom;
  if (insets.left > 0 && middleH > 0) {
    regions.push({
      id: `preset:${preset}:left`,
      rect: { x: 0, y: insets.top, w: insets.left, h: middleH },
      label: `${label} left edge`,
    });
  }
  if (insets.right > 0 && middleH > 0) {
    regions.push({
      id: `preset:${preset}:right`,
      rect: { x: 1 - insets.right, y: insets.top, w: insets.right, h: middleH },
      label: `${label} right edge`,
    });
  }

  const parts: string[] = [];
  if (insets.top > 0) parts.push(`the top ${pct(insets.top)}`);
  if (insets.bottom > 0) parts.push(`the bottom ${pct(insets.bottom)}`);
  if (insets.right > 0) parts.push(`the right edge (${pct(insets.right)})`);
  if (insets.left > 0) parts.push(`the left edge (${pct(insets.left)})`);

  const suffix =
    parts.length > 0
      ? [
          `Leave ${parts.join(', ')} of the frame clear of critical subject matter and text — platform UI, stickers, and captions render there.`,
        ]
      : [];

  const negative = preset === 'linkedin-landscape' ? [LINKEDIN_NEGATIVE] : [STORY_NEGATIVE];

  return { regions, suffix, negative };
}

function fragmentsForPreset(preset: SafeZonePresetId): PresetFragments {
  const spec = SAFE_ZONE_PRESETS[preset];
  if (spec.kind === 'none') return { regions: [], suffix: [], negative: [] };
  if (spec.kind === 'center-crop') {
    return centerCropFragments(preset, spec.cropAspectRatio ?? 1);
  }
  const insets = spec.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return insetFragments(preset, spec.label, insets);
}

/**
 * Turn a safe-zone preset, optional focus area, and caller-supplied negative
 * zones into text the agent can concatenate onto an image prompt plus a
 * negative-prompt string adapters can forward (OpenAI/Imagen/Volcengine support
 * it; others ignore it). Returns normalized rects so the caller can render
 * the same guidance as overlays on the canvas.
 *
 * All rects are in normalized [0,1] frame-local coordinates.
 */
export function buildCompositionGuidance(
  input: CompositionGuidanceInput
): CompositionGuidance {
  const regions: AvoidanceRegion[] = [];
  const suffix: string[] = [];
  const negative: string[] = [];

  if (input.preset) {
    const frag = fragmentsForPreset(input.preset);
    regions.push(...frag.regions);
    suffix.push(...frag.suffix);
    negative.push(...frag.negative);
  }

  (input.negativeZones ?? []).forEach((zone, index) => {
    const clamped = clampRect(zone);
    if (!clamped) return;
    const label = zone.label ?? `negative zone ${index + 1}`;
    regions.push({ id: `custom:${index}`, rect: clamped, label });
    suffix.push(
      `Do not place the subject in the region labelled "${label}" (x:${pct(clamped.x)} y:${pct(clamped.y)} w:${pct(clamped.w)} h:${pct(clamped.h)}).`
    );
  });

  if (input.focusArea) {
    const clamped = clampRect(input.focusArea);
    if (clamped) {
      suffix.push(
        `Keep the hero subject centered and fully inside a ${pct(clamped.w)} × ${pct(clamped.h)} focus area anchored at (${pct(clamped.x)}, ${pct(clamped.y)}).`
      );
    }
  }

  return {
    promptSuffix: suffix.join(' ').trim(),
    negativePrompt: negative.join(', '),
    avoidanceRegions: regions,
  };
}
