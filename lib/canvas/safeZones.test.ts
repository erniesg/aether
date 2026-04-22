import { describe, expect, it } from 'vitest';
import {
  getSafeZoneRect,
  resolveSafeZonePresetId,
  SAFE_ZONE_PRESETS,
} from './safeZones';

describe('safeZones', () => {
  it('resolves the seeded artboard names to distinct platform presets', () => {
    expect(resolveSafeZonePresetId({ props: { name: 'IG Post · 1080×1350' } })).toBe('ig-post');
    expect(resolveSafeZonePresetId({ props: { name: 'Story · 1080×1920' } })).toBe('story');
    expect(resolveSafeZonePresetId({ props: { name: 'Reel cover · 1080×1920' } })).toBe(
      'reel-cover'
    );
    expect(resolveSafeZonePresetId({ props: { name: 'LinkedIn · 1200×627' } })).toBe(
      'linkedin-landscape'
    );
  });

  it('prefers an explicit frame meta preset over name inference', () => {
    expect(
      resolveSafeZonePresetId({
        props: { name: 'Story · 1080×1920' },
        meta: { aetherPreset: 'reel-cover' },
      })
    ).toBe('reel-cover');
  });

  it('computes the inner safe rectangle from fractional insets', () => {
    const safe = getSafeZoneRect({ x: 10, y: 20, w: 1080, h: 1920 }, 'story');
    const spec = SAFE_ZONE_PRESETS.story.insets!;

    expect(safe.x).toBeCloseTo(10 + 1080 * spec.left);
    expect(safe.y).toBeCloseTo(20 + 1920 * spec.top);
    expect(safe.w).toBeCloseTo(1080 * (1 - spec.left - spec.right));
    expect(safe.h).toBeCloseTo(1920 * (1 - spec.top - spec.bottom));
  });

  it('computes the centered reel-cover crop window from Meta’s 420×654 preview ratio', () => {
    const safe = getSafeZoneRect({ x: 0, y: 0, w: 1080, h: 1920 }, 'reel-cover');

    expect(safe.x).toBe(0);
    expect(safe.w).toBe(1080);
    expect(safe.h).toBeCloseTo(1080 / (420 / 654));
    expect(safe.y).toBeCloseTo((1920 - safe.h) / 2);
  });
});
