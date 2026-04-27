import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  resolvePlatformsForVariation,
  pickHeroForPlatform,
  type AutoModeVariationResult,
} from './auto-mode';

function v(overrides: Partial<AutoModeVariationResult> = {}): AutoModeVariationResult {
  return {
    index: 1,
    status: 'ready',
    heroImageUrl: 'https://convex/hero-1x1.png',
    schedulePlatform: 'instagram',
    scheduleWhenLocal: '2026-04-28T19:00:00+08:00',
    agentSteps: [],
    nativePerFormatUrls: {
      '1x1': 'https://convex/hero-1x1.png',
      '4x5': 'https://convex/hero-4x5.png',
      '9x16': 'https://convex/hero-9x16.png',
      '16x9': 'https://convex/hero-16x9.png',
    },
    ...overrides,
  } as AutoModeVariationResult;
}

describe('resolvePlatformsForVariation — multi-platform fan-out', () => {
  beforeEach(() => {
    delete process.env.AUTO_MODE_PLATFORMS;
  });
  afterEach(() => {
    delete process.env.AUTO_MODE_PLATFORMS;
  });

  it('falls back to the agent-chosen schedulePlatform when env is unset', () => {
    expect(resolvePlatformsForVariation(v())).toEqual(['instagram']);
  });

  it('returns [] when env is unset AND no schedulePlatform is set', () => {
    expect(resolvePlatformsForVariation(v({ schedulePlatform: undefined }))).toEqual([]);
  });

  it('AUTO_MODE_PLATFORMS=x,instagram,linkedin → fans out across all three', () => {
    process.env.AUTO_MODE_PLATFORMS = 'x,instagram,linkedin';
    expect(resolvePlatformsForVariation(v())).toEqual([
      'x',
      'instagram',
      'linkedin',
    ]);
  });

  it('case-insensitive + whitespace-tolerant on env list', () => {
    process.env.AUTO_MODE_PLATFORMS = ' Instagram , X , LinkedIn ';
    expect(resolvePlatformsForVariation(v())).toEqual([
      'instagram',
      'x',
      'linkedin',
    ]);
  });

  it('drops unknown platforms from the env list silently', () => {
    process.env.AUTO_MODE_PLATFORMS = 'instagram,facebook,linkedin';
    expect(resolvePlatformsForVariation(v())).toEqual(['instagram', 'linkedin']);
  });
});

describe('pickHeroForPlatform — format-appropriate hero per platform', () => {
  it('IG → 4:5 native (square IG feed default)', () => {
    expect(pickHeroForPlatform(v(), 'instagram')).toBe('https://convex/hero-4x5.png');
  });

  it('LinkedIn → 16:9 native (landscape feed)', () => {
    expect(pickHeroForPlatform(v(), 'linkedin')).toBe('https://convex/hero-16x9.png');
  });

  it('X → 16:9 native (Twitter card preview)', () => {
    expect(pickHeroForPlatform(v(), 'x')).toBe('https://convex/hero-16x9.png');
  });

  it('TikTok → 9:16 native (vertical short)', () => {
    expect(pickHeroForPlatform(v(), 'tiktok')).toBe('https://convex/hero-9x16.png');
  });

  it('falls back to 1:1 then heroImageUrl when preferred aspect missing', () => {
    const noLi = v({ nativePerFormatUrls: { '1x1': 'https://convex/h-1x1.png' } });
    expect(pickHeroForPlatform(noLi, 'linkedin')).toBe('https://convex/h-1x1.png');

    const onlyHero = v({ nativePerFormatUrls: undefined });
    expect(pickHeroForPlatform(onlyHero, 'linkedin')).toBe('https://convex/hero-1x1.png');
  });
});
