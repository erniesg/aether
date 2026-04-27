import { describe, expect, it } from 'vitest';
import {
  getSafeZoneRect,
  resolveSafeZonePresetId,
  SAFE_ZONE_PRESETS,
} from './safeZones';

describe('safeZones', () => {
  it('resolves the seeded artboard names to distinct platform presets', () => {
    expect(resolveSafeZonePresetId({ props: { name: 'IG Square · 1080×1080' } })).toBe(
      'ig-square'
    );
    expect(resolveSafeZonePresetId({ props: { name: 'IG Post · 1080×1350' } })).toBe('ig-post');
    expect(resolveSafeZonePresetId({ props: { name: 'Story · 1080×1920' } })).toBe('story');
    expect(resolveSafeZonePresetId({ props: { name: 'Reel cover · 1080×1920' } })).toBe(
      'reel-cover'
    );
    expect(resolveSafeZonePresetId({ props: { name: 'LinkedIn · 1200×627' } })).toBe(
      'linkedin-landscape'
    );
  });

  it('falls back to ratio when name is not recognised', () => {
    expect(resolveSafeZonePresetId({ props: { w: 1080, h: 1080 } })).toBe('ig-square');
    expect(resolveSafeZonePresetId({ props: { w: 1080, h: 1350 } })).toBe('ig-post');
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

  it('ig-post safe zone is the centred 1:1 profile-grid crop window', () => {
    // IG profile grid crops a 4:5 post (1080×1350) to a centred 1:1 (1080×1080).
    const safe = getSafeZoneRect({ x: 0, y: 0, w: 1080, h: 1350 }, 'ig-post');
    expect(safe.x).toBe(0);
    expect(safe.w).toBe(1080);
    expect(safe.h).toBeCloseTo(1080); // 1:1 inside the 4:5
    expect(safe.y).toBeCloseTo((1350 - 1080) / 2);
  });

  it('ig-square applies a light inset for the like / comment overlay row', () => {
    const safe = getSafeZoneRect({ x: 0, y: 0, w: 1080, h: 1080 }, 'ig-square');
    const spec = SAFE_ZONE_PRESETS['ig-square'].insets!;
    expect(safe.x).toBeCloseTo(1080 * spec.left);
    expect(safe.y).toBeCloseTo(1080 * spec.top);
    expect(safe.w).toBeCloseTo(1080 * (1 - spec.left - spec.right));
    expect(safe.h).toBeCloseTo(1080 * (1 - spec.top - spec.bottom));
  });
});
