export type MotionEffectPresetId = 'product-glide' | 'caption-pop' | 'proof-pulse';

export interface MotionEffectPreset {
  id: MotionEffectPresetId;
  label: string;
  summary: string;
  remotion: {
    entranceY: number;
    entranceScale: number;
    entranceRotate: number;
  };
  hyperframes: {
    entranceEase: string;
    entranceDuration: number;
    entranceY: number;
    entranceScale: number;
  };
}

export const MOTION_EFFECT_PRESETS: MotionEffectPreset[] = [
  {
    id: 'product-glide',
    label: 'product glide',
    summary: 'smooth product-focused entrance with restrained camera motion',
    remotion: {
      entranceY: 34,
      entranceScale: 0.96,
      entranceRotate: 0,
    },
    hyperframes: {
      entranceEase: 'power3.out',
      entranceDuration: 0.45,
      entranceY: 34,
      entranceScale: 0.96,
    },
  },
  {
    id: 'caption-pop',
    label: 'caption pop',
    summary: 'short readable punch for captions, hooks, and social overlays',
    remotion: {
      entranceY: 12,
      entranceScale: 0.9,
      entranceRotate: -1,
    },
    hyperframes: {
      entranceEase: 'back.out(1.6)',
      entranceDuration: 0.34,
      entranceY: 12,
      entranceScale: 0.9,
    },
  },
  {
    id: 'proof-pulse',
    label: 'proof pulse',
    summary: 'evidence-first pulse for receipts, diffs, metrics, and claims',
    remotion: {
      entranceY: 0,
      entranceScale: 0.94,
      entranceRotate: 0.8,
    },
    hyperframes: {
      entranceEase: 'expo.out',
      entranceDuration: 0.5,
      entranceY: 0,
      entranceScale: 0.94,
    },
  },
];

export const DEFAULT_MOTION_EFFECT_PRESET_ID: MotionEffectPresetId = 'product-glide';

export function getMotionEffectPreset(value: unknown): MotionEffectPreset | null {
  if (typeof value !== 'string') return null;
  return MOTION_EFFECT_PRESETS.find((preset) => preset.id === value) ?? null;
}

export function motionEffectPresetOrDefault(value: unknown): MotionEffectPreset {
  const defaultPreset = MOTION_EFFECT_PRESETS[0]!;
  return (
    getMotionEffectPreset(value) ??
    MOTION_EFFECT_PRESETS.find((preset) => preset.id === DEFAULT_MOTION_EFFECT_PRESET_ID) ??
    defaultPreset
  );
}
