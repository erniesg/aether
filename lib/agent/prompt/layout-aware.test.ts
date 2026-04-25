import { describe, expect, it } from 'vitest';
import {
  buildLayoutAwarePrompt,
  describeBBox,
} from './layout-aware';
import type { SemanticCreativeComponent } from '@/lib/types/semantic-component';

const MULTIFORMAT: SemanticCreativeComponent = {
  hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
  product: { description: 'glass tincture bottle, label off' },
  offer: { weight: 'aggressive' },
  mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
  safeZones: [
    { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.22 } },
    { purpose: 'cta', bbox: { x: 0, y: 0.86, w: 1, h: 0.14 } },
  ],
  cropPriorities: {
    primary: { x: 0.2, y: 0.25, w: 0.6, h: 0.55 },
  },
  formats: [
    { id: 'ig-post', w: 1080, h: 1350 },
    { id: 'story', w: 1080, h: 1920 },
    { id: 'reel-cover', w: 1080, h: 1920 },
    { id: 'linkedin', w: 1200, h: 627 },
  ],
};

describe('buildLayoutAwarePrompt', () => {
  it('keeps the creator request as the lead line', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: '  tonight only, slow editorial drop  ',
      component: MULTIFORMAT,
    });
    const firstLine = out.split('\n')[0];
    expect(firstLine).toBe('tonight only, slow editorial drop');
  });

  it('describes the hero subject and product separately', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    expect(out).toContain('Hero subject: a single ripe persimmon, golden hour, satin skin.');
    expect(out).toContain('Product: glass tincture bottle, label off.');
  });

  it('lists every unique aspect ratio when multiple formats are targeted', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    // 1080×1350 = 4:5, 1080×1920 = 9:16 (two formats share that), 1200×627 ≈ 400:209
    expect(out).toMatch(/4:5/);
    expect(out).toMatch(/9:16/);
    expect(out).toMatch(/cropped to any of these aspect ratios/);
    // Story + Reel cover both reduce to 9:16 — must appear once, not twice
    expect(out.match(/9:16/g)?.length ?? 0).toBe(1);
  });

  it('omits the multi-aspect line for single-format renders', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'banner only',
      component: { ...MULTIFORMAT, formats: [{ id: 'banner', w: 1200, h: 627 }] },
    });
    expect(out).not.toMatch(/cropped to any of these/);
    expect(out).toMatch(/Aspect ratio: 1200:627\.|Aspect ratio: \d+:\d+\./);
  });

  it('describes safe zones in natural-language percentages', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    expect(out).toContain('the upper 22% of the frame for the headline');
    expect(out).toContain('the lower 14% of the frame for the cta');
  });

  it('declares the primary anchor for crop survival', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    expect(out).toMatch(/Primary subject anchor: the central 60% × 55% region of the frame; this region must survive every crop\./);
  });

  it('always ends with the "no on-image text" instruction', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    const last = out.split('\n').filter(Boolean).at(-1);
    expect(last).toMatch(/Do not render any text, logos, or watermarks/);
  });

  it('weaves brand mood keywords without duplicating component mood', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
      brandMoodKeywords: ['slow', 'oat backdrop'],
    });
    const moodLine = out.split('\n').find((l) => l.startsWith('Mood:')) ?? '';
    expect(moodLine).toContain('slow');
    expect(moodLine).toContain('editorial');
    expect(moodLine).toContain('warm bounce');
    expect(moodLine).toContain('oat backdrop');
    // 'slow' appears in both component + brand; should only show up once
    expect(moodLine.match(/slow/g)?.length).toBe(1);
  });

  it('handles a banner-only render with a centered primary anchor', () => {
    const out = buildLayoutAwarePrompt({
      creatorPrompt: 'banner only',
      component: {
        ...MULTIFORMAT,
        formats: [{ id: 'banner', w: 1200, h: 627 }],
        safeZones: [
          { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.3 } },
        ],
        cropPriorities: { primary: { x: 0.3, y: 0.3, w: 0.4, h: 0.5 } },
      },
    });
    expect(out).toContain('the upper 30% of the frame for the headline');
    expect(out).toContain('Primary subject anchor: the central 40% × 50% region');
  });

  it('emits an offer-weight cue when set', () => {
    const aggressive = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: MULTIFORMAT,
    });
    expect(aggressive).toMatch(/Offer weight is aggressive/);

    const soft = buildLayoutAwarePrompt({
      creatorPrompt: 'tonight only',
      component: { ...MULTIFORMAT, offer: { weight: 'soft' } },
    });
    expect(soft).toMatch(/Offer weight is soft/);
  });

  it('does not crash when optional fields are missing', () => {
    const minimal: SemanticCreativeComponent = {
      hero: { description: 'a wide cinematic desert at dusk' },
      mood: { keywords: [] },
      safeZones: [],
      cropPriorities: { primary: { x: 0, y: 0, w: 1, h: 1 } },
      formats: [{ id: 'square', w: 1024, h: 1024 }],
    };
    const out = buildLayoutAwarePrompt({ creatorPrompt: 'desert', component: minimal });
    expect(out).toContain('Hero subject: a wide cinematic desert at dusk.');
    expect(out).toContain('Aspect ratio: 1:1.');
    expect(out).not.toMatch(/Product:/);
    expect(out).not.toMatch(/Mood:/);
    expect(out).not.toMatch(/Reserve the following regions/);
    expect(out).not.toMatch(/Offer weight/);
  });
});

describe('describeBBox', () => {
  it('names full-width strips by upper/lower percent', () => {
    expect(describeBBox({ x: 0, y: 0, w: 1, h: 0.2 })).toBe('the upper 20% of the frame');
    expect(describeBBox({ x: 0, y: 0.85, w: 1, h: 0.15 })).toBe('the lower 15% of the frame');
  });

  it('names full-height columns by left/right percent', () => {
    expect(describeBBox({ x: 0, y: 0, w: 0.3, h: 1 })).toBe('the left 30% of the frame');
    expect(describeBBox({ x: 0.7, y: 0, w: 0.3, h: 1 })).toBe('the right 30% of the frame');
  });

  it('names a roughly-centered rectangle as central WxH', () => {
    expect(describeBBox({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 })).toBe(
      'the central 60% × 60% region of the frame'
    );
  });

  it('falls back to a directional name for off-center rectangles', () => {
    const out = describeBBox({ x: 0.05, y: 0.55, w: 0.3, h: 0.25 });
    expect(out).toMatch(/the lower-left region/);
    expect(out).toMatch(/30% × 25%/);
  });

  it('clamps coordinates that exceed [0,1]', () => {
    expect(describeBBox({ x: -0.1, y: 0, w: 1.5, h: 0.5 })).toMatch(/the upper 50% of the frame/);
  });
});
