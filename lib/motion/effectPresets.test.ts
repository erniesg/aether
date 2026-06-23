import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOTION_EFFECT_PRESET_ID,
  MOTION_EFFECT_PRESETS,
  getMotionEffectPreset,
  motionEffectPresetOrDefault,
} from './effectPresets';

describe('motion effect presets', () => {
  it('ships reusable effect presets for clip-level edits', () => {
    expect(MOTION_EFFECT_PRESETS.map((preset) => preset.id)).toEqual([
      'product-glide',
      'caption-pop',
      'proof-pulse',
    ]);
    expect(DEFAULT_MOTION_EFFECT_PRESET_ID).toBe('product-glide');

    for (const preset of MOTION_EFFECT_PRESETS) {
      expect(preset.label).not.toMatch(/pipeline|operator|dashboard|control plane/i);
      expect(preset.remotion.entranceScale).toBeGreaterThan(0);
      expect(preset.hyperframes.entranceDuration).toBeGreaterThan(0);
    }
  });

  it('normalizes unknown values to the default effect', () => {
    expect(getMotionEffectPreset('proof-pulse')?.label).toBe('proof pulse');
    expect(getMotionEffectPreset('unknown')).toBeNull();
    expect(motionEffectPresetOrDefault('unknown').id).toBe('product-glide');
  });
});
