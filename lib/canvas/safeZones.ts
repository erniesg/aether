export type SafeZonePresetId =
  | 'ig-post'
  | 'story'
  | 'reel-cover'
  | 'linkedin-landscape'
  | 'fb-feed'
  | 'x-post';

export interface SafeZoneInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeZonePreset {
  id: SafeZonePresetId;
  label: string;
  kind: 'none' | 'inset' | 'center-crop';
  insets?: SafeZoneInsets;
  cropAspectRatio?: number;
}

export interface SafeZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SafeZoneFrameLike {
  props?: {
    name?: string;
    w?: number;
    h?: number;
  };
  meta?: Record<string, unknown>;
}

/**
 * Platform-safe areas for the seeded demo artboards.
 *
 * Research basis:
 * - Instagram Stories: Meta says to leave roughly 14% top and 20% bottom
 *   free for CTA stickers in Stories ads.
 * - Instagram Reels cover: Meta recommends a 420×654 cover-photo preview,
 *   so we show the centered crop window that survives that preview.
 * - LinkedIn 1200×627 images: LinkedIn says to keep key details away from the
 *   edges, especially the lower-right corner, because display can shift by
 *   device. The inset values here are a conservative interpretation of that.
 * - IG feed 4:5: no comparable official occlusion guidance surfaced, so we
 *   don't draw a safe-zone mask there.
 * - FB feed link / photo: Meta publishes Story safe areas (same as IG
 *   Stories) but no published occlusion for feed posts themselves — we
 *   mark kind 'none' and rely on the shared 'story' preset for FB Stories.
 * - X (Twitter) 16:9 native: the service crops portrait posts to a centered
 *   16:9 in-timeline preview but shows 16:9 native images unchanged — no
 *   published occlusion, marked 'none'.
 */
export const SAFE_ZONE_PRESETS: Readonly<Record<SafeZonePresetId, SafeZonePreset>> = {
  'ig-post': {
    id: 'ig-post',
    label: 'IG post',
    kind: 'none',
  },
  story: {
    id: 'story',
    label: 'Story safe area',
    kind: 'inset',
    insets: { top: 0.14, right: 0.05, bottom: 0.2, left: 0.05 },
  },
  'reel-cover': {
    id: 'reel-cover',
    label: 'Reel cover crop',
    kind: 'center-crop',
    cropAspectRatio: 420 / 654,
  },
  'linkedin-landscape': {
    id: 'linkedin-landscape',
    label: 'LinkedIn safe area',
    kind: 'inset',
    insets: { top: 0.05, right: 0.12, bottom: 0.12, left: 0.05 },
  },
  'fb-feed': {
    id: 'fb-feed',
    label: 'Facebook feed',
    kind: 'none',
  },
  'x-post': {
    id: 'x-post',
    label: 'X post',
    kind: 'none',
  },
};

function isPresetId(value: unknown): value is SafeZonePresetId {
  return typeof value === 'string' && value in SAFE_ZONE_PRESETS;
}

function approx(a: number | undefined, b: number, tolerance = 0.02): boolean {
  if (!a || !Number.isFinite(a)) return false;
  return Math.abs(a - b) <= tolerance;
}

export function resolveSafeZonePresetId(frame: SafeZoneFrameLike): SafeZonePresetId | null {
  const metaPreset = frame.meta?.aetherPreset;
  if (isPresetId(metaPreset)) return metaPreset;

  const rawName = frame.props?.name?.trim().toLowerCase() ?? '';
  if (rawName.startsWith('ig post')) return 'ig-post';
  if (rawName.startsWith('story')) return 'story';
  if (rawName.startsWith('reel cover')) return 'reel-cover';
  if (rawName.startsWith('linkedin')) return 'linkedin-landscape';
  if (rawName.startsWith('fb ') || rawName.startsWith('facebook')) return 'fb-feed';
  if (rawName.startsWith('x post') || rawName.startsWith('x ·') || rawName.startsWith('twitter')) {
    return 'x-post';
  }

  const w = frame.props?.w;
  const h = frame.props?.h;
  const ratio = w && h ? w / h : undefined;
  if (approx(ratio, 1080 / 1350)) return 'ig-post';
  if (approx(ratio, 1200 / 627)) return 'linkedin-landscape';
  // FB 1200×630 (1.905) and X 1200×675 (1.778) only resolve by name to
  // avoid stealing the LinkedIn / IG shapes, which share close ratios.
  return null;
}

export function resolveSafeZonePreset(frame: SafeZoneFrameLike): SafeZonePreset | null {
  const presetId = resolveSafeZonePresetId(frame);
  return presetId ? SAFE_ZONE_PRESETS[presetId] : null;
}

export function hasVisibleSafeZone(preset: SafeZonePreset): boolean {
  return preset.kind !== 'none';
}

/**
 * Compute the inner "safe" rectangle for a frame given a preset's fractional
 * insets. The returned rect stays in the same coordinate space as `frame`.
 */
export function getSafeZoneRect(frame: SafeZoneRect, preset: SafeZonePresetId): SafeZoneRect {
  const spec = SAFE_ZONE_PRESETS[preset];

  if (spec.kind === 'none') return frame;

  if (spec.kind === 'center-crop') {
    const targetRatio = spec.cropAspectRatio ?? frame.w / frame.h;
    const frameRatio = frame.w / frame.h;
    if (frameRatio > targetRatio) {
      const safeW = frame.h * targetRatio;
      const inset = Math.max(0, (frame.w - safeW) / 2);
      return { x: frame.x + inset, y: frame.y, w: safeW, h: frame.h };
    }
    const safeH = frame.w / targetRatio;
    const inset = Math.max(0, (frame.h - safeH) / 2);
    return { x: frame.x, y: frame.y + inset, w: frame.w, h: safeH };
  }

  const insets = spec.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const left = frame.w * insets.left;
  const right = frame.w * insets.right;
  const top = frame.h * insets.top;
  const bottom = frame.h * insets.bottom;
  return {
    x: frame.x + left,
    y: frame.y + top,
    w: Math.max(0, frame.w - left - right),
    h: Math.max(0, frame.h - top - bottom),
  };
}
