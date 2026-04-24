import { describe, expect, it } from 'vitest';
import { buildCompositionGuidance } from './guidance';

describe('buildCompositionGuidance', () => {
  it('returns empty guidance when no preset and no zones are provided', () => {
    const g = buildCompositionGuidance({});
    expect(g.promptSuffix).toBe('');
    expect(g.negativePrompt).toBe('');
    expect(g.avoidanceRegions).toEqual([]);
  });

  it('returns empty guidance for ig-post (kind none)', () => {
    const g = buildCompositionGuidance({ preset: 'ig-post' });
    expect(g.promptSuffix).toBe('');
    expect(g.negativePrompt).toBe('');
    expect(g.avoidanceRegions).toEqual([]);
  });

  it('describes the story safe area as a single concise sentence', () => {
    const g = buildCompositionGuidance({ preset: 'story' });
    // Story insets 14/5/20/5 → safe area 90% × 66%
    expect(g.promptSuffix).toContain('90%');
    expect(g.promptSuffix).toContain('66%');
    expect(g.promptSuffix.toLowerCase()).toContain('safe area');
    expect(g.promptSuffix.toLowerCase()).toMatch(/keep|inside/);
    // One sentence, not the old verbose paragraph.
    expect(g.promptSuffix.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('excludes text/ui/stickers in the story negative prompt', () => {
    const g = buildCompositionGuidance({ preset: 'story' });
    const neg = g.negativePrompt.toLowerCase();
    expect(neg).toContain('text');
    expect(neg).toContain('ui');
    expect(neg).toContain('stickers');
  });

  it('emits normalized avoidance rects for story top and bottom bands', () => {
    const g = buildCompositionGuidance({ preset: 'story' });
    const ids = g.avoidanceRegions.map((r) => r.id);
    expect(ids).toContain('preset:story:top');
    expect(ids).toContain('preset:story:bottom');

    const top = g.avoidanceRegions.find((r) => r.id === 'preset:story:top')!;
    const bottom = g.avoidanceRegions.find((r) => r.id === 'preset:story:bottom')!;
    expect(top.rect).toEqual({ x: 0, y: 0, w: 1, h: 0.14 });
    expect(bottom.rect).toEqual({ x: 0, y: 0.8, w: 1, h: 0.2 });
  });

  it('describes the linkedin safe area with its computed dimensions', () => {
    const g = buildCompositionGuidance({ preset: 'linkedin-landscape' });
    // Insets 5/12/12/5 → safe area 83% × 83%
    expect(g.promptSuffix).toContain('83%');
    expect(g.promptSuffix.toLowerCase()).toContain('linkedin');
    expect(g.avoidanceRegions.length).toBeGreaterThanOrEqual(2);
  });

  it('describes reel-cover as a centered crop window', () => {
    const g = buildCompositionGuidance({ preset: 'reel-cover' });
    expect(g.promptSuffix.toLowerCase()).toMatch(/reel cover|center.*crop|centered/);
    const crop = g.avoidanceRegions.find((r) => r.id === 'preset:reel-cover:crop-window');
    expect(crop).toBeDefined();
    // Centered horizontal crop in a 9:16 canvas: full width, inset top/bottom.
    expect(crop!.rect.x).toBe(0);
    expect(crop!.rect.y).toBeGreaterThan(0);
    expect(crop!.rect.h).toBeLessThan(1);
  });

  it('honours additional negativeZones on top of a preset', () => {
    const g = buildCompositionGuidance({
      preset: 'story',
      negativeZones: [
        { x: 0.4, y: 0.4, w: 0.2, h: 0.2, label: 'existing logo' },
      ],
    });
    const custom = g.avoidanceRegions.find((r) => r.label === 'existing logo');
    expect(custom).toBeDefined();
    expect(g.promptSuffix.toLowerCase()).toContain('existing logo');
    // Preset suffix is still in there alongside the custom zone.
    expect(g.promptSuffix).toContain('90%');
  });

  it('honours a focusArea as a "subject must fit inside" directive', () => {
    const g = buildCompositionGuidance({
      focusArea: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    });
    expect(g.promptSuffix.toLowerCase()).toMatch(/keep|place|center/);
    expect(g.promptSuffix.toLowerCase()).toMatch(/subject|hero/);
    expect(g.promptSuffix).toContain('60%');
  });

  it('clamps negativeZone rects into [0,1] and drops degenerate ones', () => {
    const g = buildCompositionGuidance({
      negativeZones: [
        { x: -0.1, y: 0.5, w: 0.4, h: 0.4, label: 'bleed-out' },
        { x: 0.5, y: 0.5, w: 0, h: 0.1, label: 'zero-width' },
      ],
    });
    const bleed = g.avoidanceRegions.find((r) => r.label === 'bleed-out');
    expect(bleed).toBeDefined();
    expect(bleed!.rect.x).toBe(0);
    expect(bleed!.rect.w).toBeCloseTo(0.3, 5);
    expect(g.avoidanceRegions.some((r) => r.label === 'zero-width')).toBe(false);
  });
});
